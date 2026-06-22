import type { TableCell, TableData } from "../model.ts";
import type { Registry } from "../registry.ts";
import type {
  RichTextPayloadArchive,
  StorageArchive,
  TableDataList,
  TableInfoArchive,
  TableModelArchive,
  Tile,
} from "../types.ts";

/**
 * Extracts a table's cells from its `TableInfoArchive` (type 6000). The layout is
 * reverse-engineered, so every lookup is guarded: a missing model, data store, or
 * dimension yields `undefined` and the caller treats the table as un-extracted
 * rather than throwing.
 */
export function extractTable(info: TableInfoArchive, registry: Registry): TableData | undefined {
  const model = registry.resolve<TableModelArchive>(info.tableModel);
  if (!model) return undefined;
  return tableData(model, registry);
}

/** Offsets within a v5 cell-storage record, relative to the cell's byte offset. */
const CELL_TYPE_OFFSET = 1;
const KEY_OFFSET = 12;

/** Cell-type discriminators at `buffer[offset + 1]`. */
const CELL_TYPE_NUMBER = 2;
const CELL_TYPE_TEXT = 3;
const CELL_TYPE_RICH = 9;

/** A `cellOffsets` slot of `0xFFFF` means "no anchor cell in this column" (merged or empty). */
const NO_CELL = 0xffff;

/** Tile row capacity Keynote uses; the global row index is `tileid * tileSize + tileRowIndex`. */
const DEFAULT_TILE_SIZE = 256;

/** The string/rich-text lookup tables resolved once per table model. */
export interface CellTables {
  /** String-table key → plain string (text cells). */
  strings: Map<number, string>;
  /** Rich-text-table key → resolved storage text (rich-text cells). */
  richText: Map<number, string>;
}

/**
 * Builds the row-major cells for a table model. Resolves the shared string and
 * rich-text tables once, decodes every tile row into a per-column offset array,
 * then emits anchor cells with merge spans derived from the sparsity of those
 * offsets (a `0xFFFF` column is covered by an adjacent anchor).
 */
export function tableData(model: TableModelArchive, registry: Registry): TableData | undefined {
  const store = model.baseDataStore;
  if (!store) return undefined;

  const columns = model.numberOfColumns;
  const rowCount = model.numberOfRows;
  if (!columns || !rowCount) return undefined;

  const tables: CellTables = {
    strings: stringMap(registry.resolve<TableDataList>(store.stringTable)),
    richText: richTextMap(registry.resolve<TableDataList>(store.richTextTable), registry),
  };

  // Per global-row column offsets (undefined = the row was never stored, which
  // stops a vertical merge run); buffers carry the cell payloads for present rows.
  const offsetsByRow: (number[] | undefined)[] = new Array(rowCount);
  const buffers: (Uint8Array | undefined)[] = new Array(rowCount);
  const tileSize = store.tiles?.tileSize ?? DEFAULT_TILE_SIZE;

  for (const tileEntry of store.tiles?.tiles ?? []) {
    const tile = registry.resolve<Tile>(tileEntry.tile);
    if (!tile) continue;
    for (const rowInfo of tile.rowInfos) {
      const globalRow = tileEntry.tileid * tileSize + rowInfo.tileRowIndex;
      if (globalRow < 0 || globalRow >= rowCount) continue;
      offsetsByRow[globalRow] = decodeOffsets(rowInfo.cellOffsets, columns);
      buffers[globalRow] = rowInfo.cellStorageBuffer;
    }
  }

  const rows: TableCell[][] = [];
  for (let r = 0; r < rowCount; r++) {
    rows.push(decodeRow(r, columns, rowCount, offsetsByRow, buffers[r], tables));
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

/**
 * Maps each rich-text-table key to its resolved text. Each entry's
 * `richTextPayload` resolves to a `RichTextPayloadArchive` whose `storage` is a
 * `StorageArchive`; its text segments are joined with newlines.
 */
function richTextMap(list: TableDataList | undefined, registry: Registry): Map<number, string> {
  const map = new Map<number, string>();
  if (!list) return map;
  for (const entry of list.entries) {
    if (!entry.richTextPayload) continue;
    const payload = registry.resolve<RichTextPayloadArchive>(entry.richTextPayload);
    const storage = registry.resolve<StorageArchive>(payload?.storage);
    if (storage) map.set(entry.key, storage.text.join("\n"));
  }
  return map;
}

/** Reads a row's `cellOffsets` into a `columns`-length array (`NO_CELL` past the end). */
function decodeOffsets(raw: Uint8Array | undefined, columns: number): number[] {
  const out = new Array<number>(columns).fill(NO_CELL);
  if (!raw) return out;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let col = 0; col < columns; col++) {
    const at = col * 2;
    if (at + 2 > raw.byteLength) break;
    out[col] = view.getUint16(at, true);
  }
  return out;
}

/** Emits the anchor cells of one row, each with its derived colSpan/rowSpan. */
function decodeRow(
  r: number,
  columns: number,
  rowCount: number,
  offsetsByRow: (number[] | undefined)[],
  buffer: Uint8Array | undefined,
  tables: CellTables,
): TableCell[] {
  const offsets = offsetsByRow[r];
  if (!offsets || !buffer) return [];

  const cells: TableCell[] = [];
  for (let c = 0; c < columns; c++) {
    if (offsets[c] === NO_CELL) continue; // covered by a merge (or empty)
    cells.push({
      text: cellValue(buffer, offsets[c], tables),
      colSpan: colSpanAt(offsets, c, columns),
      rowSpan: rowSpanAt(offsetsByRow, r, c, rowCount),
    });
  }
  return cells;
}

/** Columns an anchor covers: itself plus the run of following `NO_CELL` columns. */
function colSpanAt(offsets: number[], c: number, columns: number): number {
  let span = 1;
  for (let col = c + 1; col < columns && offsets[col] === NO_CELL; col++) span++;
  return span;
}

/**
 * Rows an anchor at `(r, c)` covers. In iWork sparse storage a `NO_CELL` column is
 * covered horizontally by an anchor to its left in the same row, EXCEPT for the
 * "leading" gap before a row's first anchor — that gap must be covered vertically
 * by an anchor above. So extend downward only while the row below has `NO_CELL` at
 * `c` AND `c` sits before that row's first anchor (a genuine leading gap). Stop at
 * the first row where that fails (anchor present, gap is horizontal, or row absent).
 */
function rowSpanAt(offsetsByRow: (number[] | undefined)[], r: number, c: number, rowCount: number): number {
  let span = 1;
  for (let rr = r + 1; rr < rowCount; rr++) {
    const below = offsetsByRow[rr];
    if (!below || below[c] !== NO_CELL || c >= firstAnchorColumn(below)) break;
    span++;
  }
  return span;
}

/** Smallest column with an anchor in `offsets`, or the column count if the row has none. */
function firstAnchorColumn(offsets: number[]): number {
  for (let col = 0; col < offsets.length; col++) {
    if (offsets[col] !== NO_CELL) return col;
  }
  return offsets.length;
}

/**
 * Decodes a single v5 cell at `offset`. The type byte sits at `offset + 1` and a
 * little-endian uint32 key at `offset + 12`. Text cells (type 3) resolve the key
 * against the string table; rich-text cells (type 9) against the rich-text table;
 * number cells (type 2) render the key itself (integer-valued in this layout).
 * Every other type, and any out-of-bounds read, yields an empty string.
 */
export function cellValue(buffer: Uint8Array, offset: number, tables: CellTables): string {
  if (offset < 0 || offset + CELL_TYPE_OFFSET >= buffer.byteLength) return "";

  const cellType = buffer[offset + CELL_TYPE_OFFSET];
  if (cellType !== CELL_TYPE_TEXT && cellType !== CELL_TYPE_NUMBER && cellType !== CELL_TYPE_RICH) return "";

  if (offset + KEY_OFFSET + 4 > buffer.byteLength) return "";
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const key = view.getUint32(offset + KEY_OFFSET, true);

  if (cellType === CELL_TYPE_NUMBER) return String(key);
  if (cellType === CELL_TYPE_RICH) return tables.richText.get(key) ?? "";
  return tables.strings.get(key) ?? "";
}
