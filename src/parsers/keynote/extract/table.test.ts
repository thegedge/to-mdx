import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableModelArchive } from "../types.ts";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { cellText, tableData } from "./table.ts";

/** A v5 text cell: type byte at +1, a little-endian uint32 string key at +12. */
function textCell(key: number): Uint8Array {
  const buffer = new Uint8Array(16);
  buffer[1] = 3;
  new DataView(buffer.buffer).setUint32(12, key, true);
  return buffer;
}

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

test("cellText resolves a text cell's string-table key to its string", () => {
  const strings = new Map([[7, "Offsets"]]);
  assert.equal(cellText(textCell(7), 0, strings), "Offsets");
});

test("cellText returns empty for a missing key, a number cell, and other types", () => {
  const strings = new Map([[7, "Offsets"]]);
  assert.equal(cellText(textCell(99), 0, strings), ""); // unknown key

  const numberCell = new Uint8Array(16);
  numberCell[1] = 2;
  assert.equal(cellText(numberCell, 0, strings), "");

  const otherCell = new Uint8Array(16);
  otherCell[1] = 9;
  assert.equal(cellText(otherCell, 0, strings), "");
});

test("cellText is bounds-safe and never throws on a truncated buffer", () => {
  assert.equal(cellText(new Uint8Array(0), 0, new Map()), "");
  const short = new Uint8Array([0, 3, 0, 0]); // text type but no room for a key
  assert.equal(cellText(short, 0, new Map()), "");
});

test("tableData decodes a 2x2 table, leaving 0xFFFF columns empty", () => {
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
      ],
    }),
    mockObject(300n, 6002, {
      rowInfos: [
        { tileRowIndex: 0, cellCount: 2, cellStorageBuffer: concat(textCell(1), textCell(2)), cellOffsets: offsets([0, 16]) },
        { tileRowIndex: 1, cellCount: 1, cellStorageBuffer: textCell(3), cellOffsets: offsets([0, 0xffff]) },
      ],
    }),
  ]);

  assert.deepEqual(tableData(model, registry), {
    rows: [
      ["A", "B"],
      ["C", ""],
    ],
  });
});

test("tableData returns undefined when the data store or dimensions are missing", () => {
  const registry = buildRegistry([]);
  assert.equal(tableData({ numberOfRows: 2, numberOfColumns: 2 } as TableModelArchive, registry), undefined);
  assert.equal(
    tableData({ numberOfRows: 0, numberOfColumns: 0, baseDataStore: {} } as unknown as TableModelArchive, registry),
    undefined,
  );
});
