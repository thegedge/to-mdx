import type { TableCell, TableData } from "../model.ts";
import type { Registry } from "../registry.ts";
import type {
  CellStyleArchive,
  CharacterStyleArchive,
  Color,
  FillArchive,
  ParagraphStyleArchive,
  Reference,
  RichTextPayloadArchive,
  StorageArchive,
  TableDataList,
  TableInfoArchive,
  TableModelArchive,
  Tile,
} from "../types.ts";
import { alignmentToken, colorToHex, fontFamily } from "./style.ts";

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
  /**
   * Rich-text-table key → the run's text color as `#RRGGBB`, captured from the
   * cell storage's first character style when it carries a solid `fontColor`.
   * A cell with no per-run color is simply absent (it falls back to positional).
   * Optional so callers building minimal tables can omit it.
   */
  richColor?: Map<number, string>;
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

  const richColor = new Map<number, string>();
  const tables: CellTables = {
    strings: stringMap(registry.resolve<TableDataList>(store.stringTable)),
    richText: richTextMap(registry.resolve<TableDataList>(store.richTextTable), registry, richColor),
    richColor,
  };
  const styling = resolveStyling(model, registry);

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
    rows.push(decodeRow(r, columns, rowCount, offsetsByRow, buffers[r], tables, styling));
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
 * `StorageArchive`; its text segments are joined with newlines. When the storage's
 * first character style carries a solid `fontColor`, that per-run color is also
 * recorded in `colors` (keyed the same way) so the cell can override the
 * positional text color.
 */
function richTextMap(
  list: TableDataList | undefined,
  registry: Registry,
  colors: Map<number, string>,
): Map<number, string> {
  const map = new Map<number, string>();
  if (!list) return map;
  for (const entry of list.entries) {
    if (!entry.richTextPayload) continue;
    const payload = registry.resolve<RichTextPayloadArchive>(entry.richTextPayload);
    const storage = registry.resolve<StorageArchive>(payload?.storage);
    if (!storage) continue;
    map.set(entry.key, storage.text.join("\n"));
    const charStyle = registry.resolve<CharacterStyleArchive>(storage.tableCharStyle?.entries[0]?.object);
    const fontColor = charStyle?.charProperties?.fontColor;
    if (hasRgb(fontColor)) colors.set(entry.key, colorToHex(fontColor));
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
  styling: CellStyling,
): TableCell[] {
  const offsets = offsetsByRow[r];
  if (!offsets || !buffer) return [];

  const cells: TableCell[] = [];
  for (let c = 0; c < columns; c++) {
    if (offsets[c] === NO_CELL) continue; // covered by a merge (or empty)
    const background = cellBackground(styling, buffer, offsets[c], r, c);
    const text = cellText(styling, tables, buffer, offsets[c], r, c);
    cells.push({
      text: cellValue(buffer, offsets[c], tables),
      colSpan: colSpanAt(offsets, c, columns),
      rowSpan: rowSpanAt(offsetsByRow, r, c, rowCount),
      ...(background ? { backgroundColor: background.backgroundColor } : {}),
      ...(background?.backgroundOpacity !== undefined ? { backgroundOpacity: background.backgroundOpacity } : {}),
      ...(text.color ? { color: text.color } : {}),
      ...(text.fontFamily ? { fontFamily: text.fontFamily } : {}),
      ...(text.bold ? { bold: true } : {}),
      align: text.align,
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

/** A resolved cell background fill: the hex color plus its alpha when translucent. */
export interface CellBackground {
  /** `#RRGGBB`. */
  backgroundColor: string;
  /** Fill alpha (0–1, rounded to 3 decimals) when below 1; absent when fully opaque. */
  backgroundOpacity?: number;
}

/**
 * The cell-fill styling resolved once per table model: the per-cell style table
 * (keyed by the `styleTable` entry key referenced from each cell's BNC record) and
 * the positional defaults (header row/column, footer row, body) applied to cells
 * that carry no per-cell style. A map value of `undefined` means the style exists
 * but resolves to no solid fill (transparent), which still overrides the
 * positional default — so we distinguish "absent key" from "present, no fill".
 */
export interface CellStyling {
  byKey: Map<number, CellBackground | undefined>;
  /**
   * Per-cell text styles keyed by the `styleTable` entry key referenced from each
   * cell's BNC text-style id (flag `0x40`). The same `styleTable` holds both the
   * fill `CellStyleArchive`s (above) and the `ParagraphStyleArchive`s resolved here;
   * a value of `undefined` means the entry resolved to no text props. A cell's own
   * text style overrides the positional default for the properties it carries.
   */
  textByKey: Map<number, CellTextStyle | undefined>;
  header?: CellBackground;
  headerColumn?: CellBackground;
  footer?: CellBackground;
  body?: CellBackground;
  /** Positional default text styles (color + alignment), mirroring the fill defaults. */
  textHeader?: CellTextStyle;
  textHeaderColumn?: CellTextStyle;
  textFooter?: CellTextStyle;
  textBody?: CellTextStyle;
  headerRows: number;
  headerColumns: number;
  footerRows: number;
  rowCount: number;
}

/** A resolved cell text style: a hex color, CSS font family, alignment token, and/or bold flag. */
export interface CellTextStyle {
  /** `#RRGGBB`. */
  color?: string;
  /** CSS font family from the style's `charProperties.fontName` (e.g. `"Shopify Sans"`). */
  fontFamily?: string;
  /** CSS `text-align` token (`left`/`right`/`center`/`justify`). */
  align?: "left" | "right" | "center" | "justify";
  /** `true` when the style's `charProperties.bold` is set; absent otherwise. */
  bold?: boolean;
}

/**
 * A node in a `CellStyleArchive`'s inheritance chain. Mirrors the shape-style
 * pattern: a cell style's own `cellProperties` is often empty and the effective
 * `cellFill` lives one level down its inherited `super`. The library types `super`
 * as a bare `TSS.StyleArchive`, but at runtime each link is cell-style-shaped, so
 * we model the chain structurally to walk it without casts.
 */
interface CellStyleNode {
  cellProperties?: { cellFill?: FillArchive };
  super?: CellStyleNode;
}

/**
 * The effective cell fill for a style: the first `cellProperties.cellFill` found
 * walking the `super` chain (a `CellStyleArchive` usually holds it one level down,
 * so empty links are skipped rather than stopping at the top-level properties).
 */
export function effectiveCellFill(style: CellStyleArchive | undefined): FillArchive | undefined {
  let node: CellStyleNode | undefined = style as unknown as CellStyleNode | undefined;
  while (node) {
    if (node.cellProperties?.cellFill) return node.cellProperties.cellFill;
    node = node.super;
  }
  return undefined;
}

/** Converts a fill to a render-ready background (hex + optional rounded alpha), or undefined when not a solid color. */
export function fillToBackground(fill: FillArchive | undefined): CellBackground | undefined {
  const color = fill?.color;
  if (!hasRgb(color)) return undefined;
  const background: CellBackground = { backgroundColor: colorToHex(color) };
  const a = color.a ?? 1;
  if (a < 1) background.backgroundOpacity = Math.round(a * 1000) / 1000;
  return background;
}

function hasRgb(color: Color | undefined): color is Color {
  return !!color && (color.r !== undefined || color.g !== undefined || color.b !== undefined);
}

/** Resolves a style reference to its effective background fill (or undefined). */
function backgroundOf(ref: Reference | undefined, registry: Registry): CellBackground | undefined {
  return fillToBackground(effectiveCellFill(registry.resolve<CellStyleArchive>(ref)));
}

/** Builds the per-cell + positional fill lookup for a table model (resolved once). */
function resolveStyling(model: TableModelArchive, registry: Registry): CellStyling {
  const byKey = new Map<number, CellBackground | undefined>();
  const textByKey = new Map<number, CellTextStyle | undefined>();
  const styleList = registry.resolve<TableDataList>(model.baseDataStore?.styleTable);
  for (const entry of styleList?.entries ?? []) {
    // The styleTable mixes fill CellStyleArchives and text ParagraphStyleArchives;
    // each key resolves to one or the other, so the unused decode yields undefined.
    byKey.set(entry.key, fillToBackground(effectiveCellFill(registry.resolve<CellStyleArchive>(entry.reference))));
    textByKey.set(entry.key, resolveTextStyle(entry.reference, registry));
  }
  return {
    byKey,
    textByKey,
    header: backgroundOf(model.headerRowStyle, registry),
    headerColumn: backgroundOf(model.headerColumnStyle, registry),
    footer: backgroundOf(model.footerRowStyle, registry),
    body: backgroundOf(model.bodyCellStyle, registry),
    textHeader: resolveTextStyle(model.headerRowTextStyle, registry),
    textHeaderColumn: resolveTextStyle(model.headerColumnTextStyle, registry),
    textFooter: resolveTextStyle(model.footerRowTextStyle, registry),
    textBody: resolveTextStyle(model.bodyTextStyle, registry),
    headerRows: model.numberOfHeaderRows ?? 0,
    headerColumns: model.numberOfHeaderColumns ?? 0,
    footerRows: model.numberOfFooterRows ?? 0,
    rowCount: model.numberOfRows ?? 0,
  };
}

/**
 * A node in a table text style's inheritance chain. The `*TextStyle` references on
 * a `TableModelArchive` resolve to a `ParagraphStyleArchive`, whose run color lives
 * in `charProperties.fontColor` and whose alignment lives in
 * `paraProperties.alignment`. The library types `super` as a bare
 * `TSS.StyleArchive`, but at runtime each link is paragraph-style-shaped, so we walk
 * the chain structurally (matching the shape/cell-fill super-walk pattern).
 */
interface ParaStyleNode {
  charProperties?: { fontColor?: Color; fontName?: string; bold?: boolean };
  paraProperties?: { alignment?: number };
  super?: ParaStyleNode;
}

/**
 * The effective font color, font name, alignment, and bold flag for a paragraph
 * style: the first of each found walking the `super` chain (resolved independently,
 * since a link may carry one without the others). Empty links are skipped rather
 * than stopping the walk. `bold` is reported only when an explicit `true` is found.
 */
export function effectiveTextProps(
  style: ParagraphStyleArchive | undefined,
): { fontColor?: Color; fontName?: string; alignment?: number; bold?: boolean } {
  let node: ParaStyleNode | undefined = style as unknown as ParaStyleNode | undefined;
  let fontColor: Color | undefined;
  let fontName: string | undefined;
  let alignment: number | undefined;
  let bold: boolean | undefined;
  while (node) {
    if (fontColor === undefined && node.charProperties?.fontColor) fontColor = node.charProperties.fontColor;
    if (fontName === undefined && node.charProperties?.fontName) fontName = node.charProperties.fontName;
    if (alignment === undefined && node.paraProperties?.alignment !== undefined) alignment = node.paraProperties.alignment;
    if (bold === undefined && node.charProperties?.bold !== undefined) bold = node.charProperties.bold;
    if (fontColor !== undefined && fontName !== undefined && alignment !== undefined && bold !== undefined) break;
    node = node.super;
  }
  return { fontColor, fontName, alignment, bold };
}

/** Resolves a text-style reference to its effective color/font/alignment/bold, or undefined when none resolves. */
function resolveTextStyle(ref: Reference | undefined, registry: Registry): CellTextStyle | undefined {
  const style = registry.resolve<ParagraphStyleArchive>(ref);
  if (!style) return undefined;
  const { fontColor, fontName, alignment, bold } = effectiveTextProps(style);
  const resolved: CellTextStyle = {};
  if (hasRgb(fontColor)) resolved.color = colorToHex(fontColor);
  const family = fontFamily(fontName);
  if (family) resolved.fontFamily = family;
  const align = alignmentToken(alignment);
  if (align) resolved.align = align;
  if (bold === true) resolved.bold = true;
  return resolved.color !== undefined ||
    resolved.fontFamily !== undefined ||
    resolved.align !== undefined ||
    resolved.bold !== undefined
    ? resolved
    : undefined;
}

/**
 * Gated-field widths (in bytes) of a v5 BNC cell record, in flag-bit order. The
 * record's flags `uint32` sits at `offset + 8`; the gated fields begin at
 * `offset + 12`, each present only when its bit is set in the flags. The cell
 * style id (the `styleTable` entry key) is the field gated by `CELL_STYLE_FLAG`;
 * its byte position is dynamic because the value/string fields ahead of it vary in
 * width, so we walk the list summing widths until we reach that bit.
 */
const FLAGS_OFFSET = 8;
const GATED_FIELDS_OFFSET = 12;
const CELL_STYLE_FLAG = 0x20;
const CELL_TEXT_STYLE_FLAG = 0x40;
const GATED_FIELD_WIDTHS: ReadonlyArray<readonly [bit: number, width: number]> = [
  [0x1, 16], // decimal128 value
  [0x2, 8], // double value
  [0x4, 8], // date (seconds)
  [0x8, 4], // string-table id
  [0x10, 4], // rich-text id
  [0x20, 4], // cell style id
  [0x40, 4], // text style id
  [0x80, 4], // conditional style id
  [0x100, 4], // conditional rule style id
  [0x200, 4], // formula id
  [0x400, 4], // control id
  [0x800, 4], // formula error id
  [0x1000, 4], // suggest id
  [0x2000, 4], // number-format id
  [0x4000, 4], // currency-format id
  [0x8000, 4], // date-format id
];

/**
 * Reads the v5 BNC cell record's gated field at `flag` (a `styleTable` entry key)
 * from the record at `offset`, or undefined when that field is absent or the read
 * would run past the buffer. Walks the flag-gated fields, summing the widths of the
 * present fields ahead of the target field to find its position.
 */
function gatedFieldId(buffer: Uint8Array, offset: number, flag: number): number | undefined {
  if (offset < 0 || offset + GATED_FIELDS_OFFSET > buffer.byteLength) return undefined;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const flags = view.getUint32(offset + FLAGS_OFFSET, true);
  let p = offset + GATED_FIELDS_OFFSET;
  for (const [bit, width] of GATED_FIELD_WIDTHS) {
    if (!(flags & bit)) {
      if (bit === flag) return undefined; // target field not present
      continue;
    }
    if (bit === flag) return p + 4 <= buffer.byteLength ? view.getUint32(p, true) : undefined;
    p += width;
  }
  return undefined;
}

/** Reads a cell's per-cell fill style id (its `styleTable` entry key, gated by `0x20`). */
export function cellStyleId(buffer: Uint8Array, offset: number): number | undefined {
  return gatedFieldId(buffer, offset, CELL_STYLE_FLAG);
}

/** Reads a cell's per-cell text style id (its `styleTable` entry key, gated by `0x40`). */
export function cellTextStyleId(buffer: Uint8Array, offset: number): number | undefined {
  return gatedFieldId(buffer, offset, CELL_TEXT_STYLE_FLAG);
}

/**
 * The background fill for the anchor cell at `(r, c)`. Prefers the cell's per-cell
 * style (resolved from its BNC style id through the `styleTable`); a present id
 * with no solid fill yields transparent and still suppresses the positional
 * default. A cell with no per-cell style falls back to the positional default for
 * its position (header row, then footer row, then header column, else body).
 */
export function cellBackground(
  styling: CellStyling,
  buffer: Uint8Array,
  offset: number,
  r: number,
  c: number,
): CellBackground | undefined {
  const id = cellStyleId(buffer, offset);
  if (id !== undefined && styling.byKey.has(id)) return styling.byKey.get(id);
  return positionalBackground(styling, r, c);
}

/** The positional default fill for a cell, by row/column band. */
function positionalBackground(styling: CellStyling, r: number, c: number): CellBackground | undefined {
  if (r < styling.headerRows) return styling.header;
  if (styling.footerRows > 0 && r >= styling.rowCount - styling.footerRows) return styling.footer;
  if (c < styling.headerColumns) return styling.headerColumn;
  return styling.body;
}

/** The positional default text style for a cell, by row/column band (mirrors `positionalBackground`). */
function positionalTextStyle(styling: CellStyling, r: number, c: number): CellTextStyle | undefined {
  if (r < styling.headerRows) return styling.textHeader;
  if (styling.footerRows > 0 && r >= styling.rowCount - styling.footerRows) return styling.textFooter;
  if (c < styling.headerColumns) return styling.textHeaderColumn;
  return styling.textBody;
}

/**
 * The per-run text color for a rich-text cell, when its storage carried a solid
 * `fontColor` (recorded in `tables.richColor`). Returns undefined for non-rich
 * cells, an absent color, or an out-of-bounds read — callers then use the
 * positional color.
 */
function richCellColor(buffer: Uint8Array, offset: number, tables: CellTables): string | undefined {
  if (!tables.richColor || offset < 0 || offset + CELL_TYPE_OFFSET >= buffer.byteLength) return undefined;
  if (buffer[offset + CELL_TYPE_OFFSET] !== CELL_TYPE_RICH) return undefined;
  if (offset + KEY_OFFSET + 4 > buffer.byteLength) return undefined;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return tables.richColor.get(view.getUint32(offset + KEY_OFFSET, true));
}

/**
 * The cell's own per-cell text style, resolved from its BNC text-style id (flag
 * `0x40`) through the `styleTable`. Undefined when the cell carries no text-style
 * id or the id resolves to no text props; callers then use the positional default.
 */
function ownCellTextStyle(styling: CellStyling, buffer: Uint8Array, offset: number): CellTextStyle | undefined {
  const id = cellTextStyleId(buffer, offset);
  return id !== undefined ? styling.textByKey.get(id) : undefined;
}

/**
 * The resolved text color, font family, alignment, and bold flag for the cell at
 * `(r, c)`. Each property prefers the cell's own text style (from its BNC text-style
 * id), then falls back to the positional band style. Color additionally honors a
 * per-cell rich-text run color between the two (own text style still wins over it).
 * Alignment defaults to `center` (this deck is uniformly centered). Color, font
 * family, and bold are omitted when nothing resolves them.
 */
export function cellText(
  styling: CellStyling,
  tables: CellTables,
  buffer: Uint8Array,
  offset: number,
  r: number,
  c: number,
): { color?: string; fontFamily?: string; align: string; bold?: boolean } {
  const own = ownCellTextStyle(styling, buffer, offset);
  const positional = positionalTextStyle(styling, r, c);
  const color = own?.color ?? richCellColor(buffer, offset, tables) ?? positional?.color;
  const fontFamily = own?.fontFamily ?? positional?.fontFamily;
  const align = own?.align ?? positional?.align ?? "center";
  const bold = own?.bold ?? positional?.bold;
  return {
    ...(color !== undefined ? { color } : {}),
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    ...(bold ? { bold: true } : {}),
    align,
  };
}
