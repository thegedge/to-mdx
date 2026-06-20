import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject } from "../test_support.ts";
import { KeynoteType } from "../types.ts";
import type { ImageArchive } from "../types.ts";
import { buildDataInfoMap, imageFromArchive } from "./images.ts";

test("buildDataInfoMap reads datas from a PackageMetadata object resolved by name", () => {
  const registry = buildRegistry([
    mockObject(1n, KeynoteType.packageMetadata, {
      datas: [
        { identifier: 100n, fileName: "shot.png" },
        { identifier: 101n, preferredFileName: "fallback.jpg" },
      ],
    }),
  ]);

  const map = buildDataInfoMap(registry);
  assert.equal(map.get(100n), "shot.png");
  assert.equal(map.get(101n), "fallback.jpg");
});

test("buildDataInfoMap duck-types datas even under an unexpected type id", () => {
  // Real decks have been seen to carry the data map under a type id the library
  // doesn't label PackageMetadata; the scan must still find it.
  const registry = buildRegistry([
    mockObject(1n, 987654, { datas: [{ identifier: 200n, fileName: "diagram.png" }] }),
  ]);

  assert.equal(buildDataInfoMap(registry).get(200n), "diagram.png");
});

test("imageFromArchive resolves the file name via the data reference chain", () => {
  const dataInfo = new Map<bigint, string>([[100n, "shot.png"]]);
  const image = {
    super: { accessibilityDescription: "a chart" },
    data: { identifier: 100n },
  } as ImageArchive;

  assert.deepEqual(imageFromArchive(image, dataInfo, "a chart"), { fileName: "shot.png", altText: "a chart" });
});

test("imageFromArchive falls back to originalData and returns null when unmapped", () => {
  const dataInfo = new Map<bigint, string>([[55n, "orig.png"]]);
  const viaOriginal = { originalData: { identifier: 55n } } as ImageArchive;
  assert.equal(imageFromArchive(viaOriginal, dataInfo, "")?.fileName, "orig.png");

  const unmapped = { data: { identifier: 999n } } as ImageArchive;
  assert.equal(imageFromArchive(unmapped, dataInfo, ""), null);
});
