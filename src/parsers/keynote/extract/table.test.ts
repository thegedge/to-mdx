import assert from "node:assert/strict";
import { test } from "node:test";
import type { CellStyleArchive, TableModelArchive } from "../types.ts";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import {
  cellBackground,
  cellStyleId,
  type CellStyling,
  type CellTables,
  cellText,
  cellValue,
  effectiveCellFill,
  effectiveTextProps,
  fillToBackground,
  tableData,
} from "./table.ts";

/** A v5 cell record: type byte at +1, a little-endian uint32 key at +12. */
function cell(type: number, key: number): Uint8Array {
  const buffer = new Uint8Array(16);
  buffer[1] = type;
  new DataView(buffer.buffer).setUint32(12, key, true);
  return buffer;
}

/**
 * A v5 BNC cell record carrying a string key (flag 0x8) and a cell style id (flag
 * 0x20): flags `uint32` at +8, then the string key at +12 and the style id at +16.
 */
function styledCell(stringKey: number, styleId: number): Uint8Array {
  const buffer = new Uint8Array(20);
  buffer[0] = 5; // version
  buffer[1] = 3; // text cell
  const view = new DataView(buffer.buffer);
  view.setUint32(8, 0x8 | 0x20, true); // string + cell-style fields present
  view.setUint32(12, stringKey, true);
  view.setUint32(16, styleId, true);
  return buffer;
}

const textCell = (key: number) => cell(3, key);

function offsets(values: number[]): Uint8Array {
  const buffer = new Uint8Array(values.length * 2);
  const view = new DataView(buffer.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const noTables: CellTables = { strings: new Map(), richText: new Map() };

test("cellValue resolves each cell type: text→string, number→its integer, richtext→storage text", () => {
  const tables: CellTables = {
    strings: new Map([[7, "Offsets"]]),
    richText: new Map([[42, "Rich\ncell"]]),
  };

  assert.equal(cellValue(textCell(7), 0, tables), "Offsets"); // type 3
  assert.equal(cellValue(cell(2, 1234), 0, tables), "1234"); // type 2 → integer key
  assert.equal(cellValue(cell(9, 42), 0, tables), "Rich\ncell"); // type 9 → resolved storage
});

test("cellValue returns empty for a missing key and for an unknown cell type", () => {
  const tables: CellTables = { strings: new Map([[7, "Offsets"]]), richText: new Map() };
  assert.equal(cellValue(textCell(99), 0, tables), ""); // unknown string key
  assert.equal(cellValue(cell(9, 99), 0, tables), ""); // unknown rich-text key
  assert.equal(cellValue(cell(5, 7), 0, tables), ""); // unknown cell type
});

test("cellValue is bounds-safe and never throws on a truncated buffer", () => {
  assert.equal(cellValue(new Uint8Array(0), 0, noTables), "");
  const short = new Uint8Array([0, 3, 0, 0]); // text type but no room for a key
  assert.equal(cellValue(short, 0, noTables), "");
});

test("tableData decodes a plain 2x2 table at stored row indices, every cell span 1", () => {
  const model: TableModelArchive = {
    numberOfRows: 2,
    numberOfColumns: 2,
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, {
      listType: 1,
      entries: [
        { key: 1, string: "A" },
        { key: 2, string: "B" },
        { key: 3, string: "C" },
        { key: 4, string: "D" },
      ],
    }),
    mockObject(300n, 6002, {
      rowInfos: [
        { tileRowIndex: 0, cellStorageBuffer: concat(textCell(1), textCell(2)), cellOffsets: offsets([0, 16]) },
        { tileRowIndex: 1, cellStorageBuffer: concat(textCell(3), textCell(4)), cellOffsets: offsets([0, 16]) },
      ],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [
      [
        { text: "A", colSpan: 1, rowSpan: 1, align: "center" },
        { text: "B", colSpan: 1, rowSpan: 1, align: "center" },
      ],
      [
        { text: "C", colSpan: 1, rowSpan: 1, align: "center" },
        { text: "D", colSpan: 1, rowSpan: 1, align: "center" },
      ],
    ],
  });
});

test("tableData resolves a rich-text cell through its payload storage", () => {
  const model: TableModelArchive = {
    numberOfRows: 1,
    numberOfColumns: 1,
    baseDataStore: {
      richTextTable: ref(400n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(400n, 6002, { listType: 8, entries: [{ key: 5, richTextPayload: ref(401n) }] }),
    mockObject(401n, 6218, { storage: ref(402n) }),
    mockObject(402n, 2001, { text: ["Multi", "line"] }),
    mockObject(300n, 6002, {
      rowInfos: [{ tileRowIndex: 0, cellStorageBuffer: cell(9, 5), cellOffsets: offsets([0]) }],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [[{ text: "Multi\nline", colSpan: 1, rowSpan: 1, align: "center" }]],
  });
});

test("tableData derives colspans from a 0xFFFF run between anchors", () => {
  // Columns 0,1,2 and 10 are anchors; 3..9 are 0xFFFF (covered by col 2).
  const slots = [0, 16, 32, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 48];
  const model: TableModelArchive = {
    numberOfRows: 1,
    numberOfColumns: 11,
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, {
      listType: 1,
      entries: [
        { key: 1, string: "a" },
        { key: 2, string: "b" },
        { key: 3, string: "c" },
        { key: 4, string: "d" },
      ],
    }),
    mockObject(300n, 6002, {
      rowInfos: [
        {
          tileRowIndex: 0,
          cellStorageBuffer: concat(textCell(1), textCell(2), textCell(3), textCell(4)),
          cellOffsets: offsets(slots),
        },
      ],
    }),
  ]);

  const row = tableData(model, registry)?.rows[0];
  assert.deepEqual(row?.map((cell) => cell.colSpan), [1, 1, 8, 1]);
});

test("tableData derives a rowspan from a vertical 0xFFFF run", () => {
  const model: TableModelArchive = {
    numberOfRows: 3,
    numberOfColumns: 1,
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, { listType: 1, entries: [{ key: 1, string: "top" }, { key: 2, string: "bottom" }] }),
    mockObject(300n, 6002, {
      rowInfos: [
        { tileRowIndex: 0, cellStorageBuffer: textCell(1), cellOffsets: offsets([0]) },
        { tileRowIndex: 1, cellStorageBuffer: new Uint8Array(0), cellOffsets: offsets([0xffff]) },
        { tileRowIndex: 2, cellStorageBuffer: textCell(2), cellOffsets: offsets([0]) },
      ],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [
      [{ text: "top", colSpan: 1, rowSpan: 2, align: "center" }], // row 1 below is 0xFFFF → spans down
      [], // covered row emits no anchor
      [{ text: "bottom", colSpan: 1, rowSpan: 1, align: "center" }],
    ],
  });
});

test("tableData does not over-span a dense row sitting above sparse wide-anchor rows", () => {
  // Row 0: a dense "bit" row, every column an anchor. Rows 1..2: sparse rows whose
  // first anchor is at column 0 (no leading gap) with wide colspans covering the
  // rest. The dense row must NOT inherit rowspans from the 0xFFFF cells below it.
  const model: TableModelArchive = {
    numberOfRows: 3,
    numberOfColumns: 4,
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, {
      listType: 1,
      entries: [
        { key: 1, string: "a" },
        { key: 2, string: "b" },
      ],
    }),
    mockObject(300n, 6002, {
      rowInfos: [
        {
          tileRowIndex: 0,
          cellStorageBuffer: concat(textCell(1), textCell(1), textCell(1), textCell(1)),
          cellOffsets: offsets([0, 16, 32, 48]),
        },
        {
          tileRowIndex: 1,
          cellStorageBuffer: concat(textCell(2), textCell(2)),
          cellOffsets: offsets([0, 0xffff, 16, 0xffff]),
        },
        {
          tileRowIndex: 2,
          cellStorageBuffer: concat(textCell(2), textCell(2)),
          cellOffsets: offsets([0, 0xffff, 16, 0xffff]),
        },
      ],
    }),
  ]);

  const rows = tableData(model, registry)?.rows;
  assert.deepEqual(rows?.[0].map((c) => c.rowSpan), [1, 1, 1, 1]); // no bogus over-span
});

test("tableData spans a leading-gap anchor across rows whose first anchor is right of it", () => {
  // Anchor at (0,0). Rows 1 and 2 have column 0 == 0xFFFF (a leading gap, since each
  // row's first anchor is at column 1) → the top-left anchor spans all three rows.
  const model: TableModelArchive = {
    numberOfRows: 3,
    numberOfColumns: 2,
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, {
      listType: 1,
      entries: [
        { key: 1, string: "merged" },
        { key: 2, string: "x" },
      ],
    }),
    mockObject(300n, 6002, {
      rowInfos: [
        { tileRowIndex: 0, cellStorageBuffer: concat(textCell(1), textCell(2)), cellOffsets: offsets([0, 16]) },
        { tileRowIndex: 1, cellStorageBuffer: textCell(2), cellOffsets: offsets([0xffff, 0]) },
        { tileRowIndex: 2, cellStorageBuffer: textCell(2), cellOffsets: offsets([0xffff, 0]) },
      ],
    }),
  ]);

  const rows = tableData(model, registry)?.rows;
  assert.equal(rows?.[0][0].rowSpan, 3); // leading 0xFFFF in rows 1,2 → vertical merge
});

test("tableData returns undefined when the data store or dimensions are missing", () => {
  const registry = buildRegistry([]);
  assert.equal(tableData({ numberOfRows: 2, numberOfColumns: 2 } as TableModelArchive, registry), undefined);
  assert.equal(
    tableData({ numberOfRows: 0, numberOfColumns: 0, baseDataStore: {} } as unknown as TableModelArchive, registry),
    undefined,
  );
});

test("fillToBackground converts a cell fill to hex, mapping a sub-1 alpha to a rounded opacity", () => {
  // Translucent red (0.985, 0.546, 0.541, a:0.249) — a per-cell highlight from the deck.
  const fill = { color: { r: 0.985, g: 0.546, b: 0.541, a: 0.249 } };
  assert.deepEqual(fillToBackground(fill), { backgroundColor: "#fb8b8a", backgroundOpacity: 0.249 });

  // Opaque fill emits no opacity field.
  assert.deepEqual(fillToBackground({ color: { r: 1, g: 1, b: 1, a: 1 } }), { backgroundColor: "#ffffff" });

  // No solid color → no background.
  assert.equal(fillToBackground(undefined), undefined);
  assert.equal(fillToBackground({}), undefined);
});

test("effectiveCellFill walks the super chain when the outer style carries no cellFill", () => {
  const style = {
    cellProperties: {}, // empty outer properties
    super: { super: { cellProperties: { cellFill: { color: { r: 0, g: 0.4, b: 0.75 } } } } },
  };
  const fill = effectiveCellFill(style as unknown as CellStyleArchive);
  assert.deepEqual(fillToBackground(fill), { backgroundColor: "#0066bf" });
});

test("cellStyleId reads the BNC style id past the variable-width value/string fields", () => {
  assert.equal(cellStyleId(styledCell(7, 4), 0), 4); // string (4 bytes) then style id
  // A cell with no style flag set yields undefined (the legacy zeroed-flags record).
  assert.equal(cellStyleId(cell(3, 7), 0), undefined);
  // Bounds-safe on a truncated record.
  assert.equal(cellStyleId(new Uint8Array(4), 0), undefined);
});

test("cellBackground maps a per-cell style id to its styleTable fill, else the positional default", () => {
  const styling: CellStyling = {
    byKey: new Map([
      [4, { backgroundColor: "#223274", backgroundOpacity: 0.151 }],
      [6, undefined], // present but transparent
    ]),
    header: { backgroundColor: "#0066bf" },
    headerColumn: undefined,
    footer: undefined,
    body: { backgroundColor: "#ffffff" },
    headerRows: 1,
    headerColumns: 0,
    footerRows: 0,
    rowCount: 3,
  };

  // Per-cell style id 4 wins regardless of position.
  assert.deepEqual(cellBackground(styling, styledCell(1, 4), 0, 2, 0), {
    backgroundColor: "#223274",
    backgroundOpacity: 0.151,
  });
  // A present-but-transparent style id (6) suppresses the positional default.
  assert.equal(cellBackground(styling, styledCell(1, 6), 0, 0, 0), undefined);
  // No per-cell style → positional default: header row, then body.
  assert.deepEqual(cellBackground(styling, cell(3, 1), 0, 0, 0), { backgroundColor: "#0066bf" });
  assert.deepEqual(cellBackground(styling, cell(3, 1), 0, 1, 0), { backgroundColor: "#ffffff" });
});

test("tableData applies per-cell styleTable fills and positional defaults to cells", () => {
  const model: TableModelArchive = {
    numberOfRows: 1,
    numberOfColumns: 2,
    bodyCellStyle: ref(500n),
    baseDataStore: {
      stringTable: ref(200n),
      styleTable: ref(600n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, { listType: 1, entries: [{ key: 1, string: "A" }, { key: 2, string: "B" }] }),
    mockObject(500n, 6004, { cellProperties: { cellFill: { color: { r: 1, g: 1, b: 1, a: 1 } } } }),
    mockObject(600n, 6005, { listType: 4, entries: [{ key: 4, reference: ref(601n) }] }),
    mockObject(601n, 6004, { cellProperties: { cellFill: { color: { r: 0.133, g: 0.196, b: 0.454, a: 0.151 } } } }),
    mockObject(300n, 6002, {
      rowInfos: [
        {
          tileRowIndex: 0,
          // Col 0: styled cell (id 4) → blue 15%. Col 1: no style id → positional body white.
          cellStorageBuffer: concat(styledCell(1, 4), cell(3, 2)),
          cellOffsets: offsets([0, 20]),
        },
      ],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [
      [
        { text: "A", colSpan: 1, rowSpan: 1, backgroundColor: "#223274", backgroundOpacity: 0.151, align: "center" },
        { text: "B", colSpan: 1, rowSpan: 1, backgroundColor: "#ffffff", align: "center" },
      ],
    ],
  });
});

test("effectiveTextProps walks the super chain for the first font color, font name, and alignment", () => {
  // Color + font name sit on the outer link; alignment is inherited one level down its super.
  const style = {
    charProperties: { fontColor: { r: 1, g: 1, b: 1 }, fontName: "ShopifySans-Light" },
    paraProperties: {},
    super: { paraProperties: { alignment: 1 } },
  };
  assert.deepEqual(effectiveTextProps(style as unknown as Parameters<typeof effectiveTextProps>[0]), {
    fontColor: { r: 1, g: 1, b: 1 },
    fontName: "ShopifySans-Light",
    alignment: 1,
  });
  assert.deepEqual(effectiveTextProps(undefined), { fontColor: undefined, fontName: undefined, alignment: undefined });
});

/** A `CellStyling` carrying only positional text styles (no fills), for `cellText` tests. */
function textStyling(over: Partial<CellStyling>): CellStyling {
  return {
    byKey: new Map(),
    headerRows: 0,
    headerColumns: 0,
    footerRows: 0,
    rowCount: 3,
    ...over,
  };
}

test("cellText resolves a positional text color and defaults alignment to center", () => {
  const styling = textStyling({ textBody: { color: "#000000" } });
  // Body cell: positional color, default-center alignment.
  assert.deepEqual(cellText(styling, noTables, textCell(1), 0, 1, 0), { color: "#000000", align: "center" });
  // No positional style resolves → color omitted, alignment still defaults to center.
  assert.deepEqual(cellText(textStyling({}), noTables, textCell(1), 0, 1, 0), { align: "center" });
});

test("cellText resolves the positional font family alongside color/alignment", () => {
  const styling = textStyling({ textBody: { color: "#000000", fontFamily: "Shopify Sans" } });
  assert.deepEqual(cellText(styling, noTables, textCell(1), 0, 1, 0), {
    color: "#000000",
    fontFamily: "Shopify Sans",
    align: "center",
  });
  // No positional style → no font family, alignment still centers.
  assert.deepEqual(cellText(textStyling({}), noTables, textCell(1), 0, 1, 0), { align: "center" });
});

test("cellText honors an explicit positional alignment and picks the band's text style", () => {
  const styling = textStyling({
    headerRows: 1,
    textHeader: { color: "#ffffff", align: "left" },
    textBody: { color: "#000000" },
  });
  // Header row: white text, explicit left alignment.
  assert.deepEqual(cellText(styling, noTables, textCell(1), 0, 0, 0), { color: "#ffffff", align: "left" });
  // Body row falls back to the body text style (center).
  assert.deepEqual(cellText(styling, noTables, textCell(1), 0, 1, 0), { color: "#000000", align: "center" });
});

test("cellText lets a per-cell rich-text color override the positional color", () => {
  const styling = textStyling({ textBody: { color: "#000000" } });
  const tables: CellTables = { strings: new Map(), richText: new Map(), richColor: new Map([[5, "#fb8b8a"]]) };
  // Rich cell (type 9) keyed 5 → its run color wins over the body default.
  assert.deepEqual(cellText(styling, tables, cell(9, 5), 0, 1, 0), { color: "#fb8b8a", align: "center" });
  // A rich cell with no recorded color falls back to the positional color.
  assert.deepEqual(cellText(styling, tables, cell(9, 9), 0, 1, 0), { color: "#000000", align: "center" });
});

test("tableData resolves positional text color + alignment from the model's text styles", () => {
  const model: TableModelArchive = {
    numberOfRows: 2,
    numberOfColumns: 1,
    numberOfHeaderRows: 1,
    headerRowTextStyle: ref(700n),
    bodyTextStyle: ref(701n),
    baseDataStore: {
      stringTable: ref(200n),
      tiles: { tileSize: 256, tiles: [{ tileid: 0, tile: ref(300n) }] },
    },
  } as unknown as TableModelArchive;

  const registry = buildRegistry([
    mockObject(200n, 6005, { listType: 1, entries: [{ key: 1, string: "Head" }, { key: 2, string: "Body" }] }),
    // Header text style: white, ShopifySans-Light, center (alignment 2). Body: black, same font, default center.
    mockObject(700n, 2022, { charProperties: { fontColor: { r: 1, g: 1, b: 1, a: 1 }, fontName: "ShopifySans-Light" }, paraProperties: { alignment: 2 } }),
    mockObject(701n, 2022, { charProperties: { fontColor: { r: 0, g: 0, b: 0, a: 1 }, fontName: "ShopifySans-Light" }, paraProperties: {} }),
    mockObject(300n, 6002, {
      rowInfos: [
        { tileRowIndex: 0, cellStorageBuffer: textCell(1), cellOffsets: offsets([0]) },
        { tileRowIndex: 1, cellStorageBuffer: textCell(2), cellOffsets: offsets([0]) },
      ],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [
      [{ text: "Head", colSpan: 1, rowSpan: 1, color: "#ffffff", fontFamily: "Shopify Sans", align: "center" }],
      [{ text: "Body", colSpan: 1, rowSpan: 1, color: "#000000", fontFamily: "Shopify Sans", align: "center" }],
    ],
  });
});
