import type { TableData } from "../model.ts";
import type { Registry } from "../registry.ts";
import type { TableDataList, TableInfoArchive, TableModelArchive, Tile, TileRowInfo } from "../types.ts";

/**
 * Extracts a table's cell text from its `TableInfoArchive` (type 6000). The
 * layout is reverse-engineered, so every lookup is guarded: a missing model,
 * data store, or dimension yields `undefined` and the caller treats the table as
 * un-extracted rather than throwing.
 */
export function extractTable(info: TableInfoArchive, registry: Registry): TableData | undefined {
  const model = registry.resolve<TableModelArchive>(info.tableModel);
  if (!model) return undefined;
  return tableData(model, registry);
}

/** Offsets within a v5 cell-storage record, relative to the cell's byte offset. */
const CELL_TYPE_OFFSET = 1;
const TEXT_KEY_OFFSET = 12;

/** Cell-type discriminator at `buffer[offset + 1]`; only TEXT carries recoverable text. */
const CELL_TYPE_TEXT = 3;

/** A `cellOffsets` slot of `0xFFFF` means "no cell in this column". */
const NO_CELL = 0xffff;

/** Tile row capacity Keynote uses; the global row index is `tileid * tileSize + tileRowIndex`. */
const DEFAULT_TILE_SIZE = 256;

/**
 * Builds the row-major cell text for a table model. Resolves the shared string
 * table once, then walks every tile's rows, placing each at its global index.
 * Cells that are blank, non-text, or unresolved become empty strings.
 */
export function tableData(model: TableModelArchive, registry: Registry): TableData | undefined {
  const store = model.baseDataStore;
  if (!store) return undefined;

  const columns = model.numberOfColumns;
  const rowCount = model.numberOfRows;
  if (!columns || !rowCount) return undefined;

  const strings = stringMap(registry.resolve<TableDataList>(store.stringTable));

  const rows: string[][] = Array.from({ length: rowCount }, () => emptyRow(columns));
  const tileSize = store.tiles?.tileSize ?? DEFAULT_TILE_SIZE;

  for (const tileEntry of store.tiles?.tiles ?? []) {
    const tile = registry.resolve<Tile>(tileEntry.tile);
    if (!tile) continue;
    for (const rowInfo of tile.rowInfos) {
      const globalRow = tileEntry.tileid * tileSize + rowInfo.tileRowIndex;
      if (globalRow < 0 || globalRow >= rowCount) continue;
      rows[globalRow] = decodeRow(rowInfo, columns, strings);
    }
  }

  return { rows };
}

/** Maps each string-table key to its stored string (skipping non-string entries). */
function stringMap(list: TableDataList | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!list) return map;
  for (const entry of list.entries) {
    if (entry.string !== undefined) map.set(entry.key, entry.string);
  }
  return map;
}

/** Decodes one tile row into a fixed-length array of `columns` cell strings. */
function decodeRow(rowInfo: TileRowInfo, columns: number, strings: Map<number, string>): string[] {
  const row = emptyRow(columns);
  const buffer = rowInfo.cellStorageBuffer;
  const offsets = rowInfo.cellOffsets;
  if (!buffer || !offsets) return row;

  const offsetsView = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
  for (let col = 0; col < columns; col++) {
    const at = col * 2;
    if (at + 2 > offsets.byteLength) break;
    const cellOffset = offsetsView.getUint16(at, true);
    if (cellOffset === NO_CELL) continue;
    row[col] = cellText(buffer, cellOffset, strings);
  }
  return row;
}

/**
 * Decodes a single v5 cell at `offset` within a row's `cellStorageBuffer`. A text
 * cell (`cellType === 3`) carries a little-endian uint32 string-table key at
 * `offset + 12`; we return its string. Number cells (`cellType === 2`) and every
 * other type render as empty — we cannot reliably locate their value, and a blank
 * cell is preferable to a crash or garbage. All reads are bounds-checked.
 */
export function cellText(buffer: Uint8Array, offset: number, strings: Map<number, string>): string {
  if (offset < 0 || offset + CELL_TYPE_OFFSET >= buffer.byteLength) return "";

  // Number cells (type 2) and every other type have no recoverable text here.
  const cellType = buffer[offset + CELL_TYPE_OFFSET];
  if (cellType !== CELL_TYPE_TEXT) return "";

  if (offset + TEXT_KEY_OFFSET + 4 > buffer.byteLength) return "";
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const key = view.getUint32(offset + TEXT_KEY_OFFSET, true);
  return strings.get(key) ?? "";
}

function emptyRow(columns: number): string[] {
  return Array.from({ length: columns }, () => "");
}
