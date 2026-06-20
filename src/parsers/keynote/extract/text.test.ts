import assert from "node:assert/strict";
import { test } from "node:test";
import { Registry } from "../registry.ts";
import type { ShapeInfoArchive, StorageArchive } from "../types.ts";
import { extractParagraphs, storageForShape } from "./text.ts";

function storage(text: string[], paraData?: Array<{ characterIndex: number; first: number; second: number }>): StorageArchive {
  return {
    text,
    tableParaData: paraData ? { entries: paraData } : undefined,
  } as StorageArchive;
}

test("extractParagraphs splits joined text on newlines and trims", () => {
  const paragraphs = extractParagraphs(storage(["First line\nSecond", " line\n\nThird"]), new Registry());

  assert.deepEqual(paragraphs, [
    { depth: 0, text: "First line" },
    { depth: 0, text: "Second line" },
    { depth: 0, text: "Third" },
  ]);
});

test("extractParagraphs returns empty for missing or blank storage", () => {
  assert.deepEqual(extractParagraphs(undefined, new Registry()), []);
  assert.deepEqual(extractParagraphs(storage(["   \n  "]), new Registry()), []);
});

test("extractParagraphs maps tableParaData character indices to bullet depth", () => {
  // Text: "Top\nChild\nGrand" -> char indices 0, 4, 10
  const paragraphs = extractParagraphs(
    storage(
      ["Top\nChild\nGrand"],
      [
        { characterIndex: 0, first: 0, second: 0 },
        { characterIndex: 4, first: 1, second: 0 },
        { characterIndex: 10, first: 2, second: 0 },
      ],
    ),
    new Registry(),
  );

  assert.deepEqual(paragraphs, [
    { depth: 0, text: "Top" },
    { depth: 1, text: "Child" },
    { depth: 2, text: "Grand" },
  ]);
});

test("storageForShape prefers ownedStorage then textFlow", () => {
  const registry = new Registry();
  const owned = storage(["owned"]);
  const flow = storage(["flow"]);
  // Hand-register both targets.
  registry.add({ identifier: 1n, offset: 0, length: 0, messages: [msg(2001, owned)] });
  registry.add({ identifier: 2n, offset: 0, length: 0, messages: [msg(2001, flow)] });

  const withOwned = { ownedStorage: { identifier: 1n }, textFlow: { identifier: 2n } } as ShapeInfoArchive;
  assert.equal(storageForShape(withOwned, registry), owned);

  const withFlowOnly = { textFlow: { identifier: 2n } } as ShapeInfoArchive;
  assert.equal(storageForShape(withFlowOnly, registry), flow);

  assert.equal(storageForShape(undefined, registry), undefined);
});

function msg(type: number, data: unknown) {
  return {
    info: {
      type,
      version: [],
      length: 0,
      fieldInfos: [],
      objectReferences: [],
      dataReferences: [],
      diffMergeVersion: [],
      fieldsToRemove: [],
      diffReadVersion: [],
    },
    offset: 0,
    length: 0,
    data,
  };
}
