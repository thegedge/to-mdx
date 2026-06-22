import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableModelArchive } from "../types.ts";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { type CellTables, cellValue, tableData } from "./table.ts";

/** A v5 cell record: type byte at +1, a little-endian uint32 key at +12. */
function cell(type: number, key: number): Uint8Array {
  const buffer = new Uint8Array(16);
  buffer[1] = type;
  new DataView(buffer.buffer).setUint32(12, key, true);
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
        { text: "A", colSpan: 1, rowSpan: 1 },
        { text: "B", colSpan: 1, rowSpan: 1 },
      ],
      [
        { text: "C", colSpan: 1, rowSpan: 1 },
        { text: "D", colSpan: 1, rowSpan: 1 },
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
    rows: [[{ text: "Multi\nline", colSpan: 1, rowSpan: 1 }]],
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
      [{ text: "top", colSpan: 1, rowSpan: 2 }], // row 1 below is 0xFFFF → spans down
      [], // covered row emits no anchor
      [{ text: "bottom", colSpan: 1, rowSpan: 1 }],
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
