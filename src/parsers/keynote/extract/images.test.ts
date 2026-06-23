import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject } from "../test_support.ts";
import { KeynoteType } from "../types.ts";
import type { ImageArchive } from "../types.ts";
import {
  buildDataFileNameMap,
  buildDataInfoMap,
  buildDataSourceMap,
  distinctImageFileNames,
  imageCoverageWarning,
  imageFromArchive,
} from "./images.ts";

test("buildDataFileNameMap keys each Data/ asset by its id, stripping the -<id> display suffix", () => {
  const empty = new Uint8Array();
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/img_percy-4113.jpg", empty],
    ["Data/name-small-480.jpg", empty],
    ["Data/alex-238098-2103.jpg", empty],
    ["Data/pasted-image-3754.svg", empty],
    ["Documents/index.iwa", empty],
    ["Data/no-id-here.png", empty],
  ]);

  const map = buildDataFileNameMap(dataFiles);
  assert.equal(map.get(4113), "img_percy.jpg");
  assert.equal(map.get(480), "name-small.jpg");
  assert.equal(map.get(2103), "alex-238098.jpg");
  assert.equal(map.get(3754), "pasted-image.svg");
  // Non-Data entries and id-less names are ignored.
  assert.equal(map.size, 4);
});

test("buildDataFileNameMap keeps distinct names when two ids strip to the same base", () => {
  const empty = new Uint8Array();
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/shot-10.png", empty],
    ["Data/shot-20.png", empty],
  ]);

  const map = buildDataFileNameMap(dataFiles);
  // Both keep their unambiguous source name, so neither image is lost.
  assert.equal(map.get(10), "shot-10.png");
  assert.equal(map.get(20), "shot-20.png");
});

test("buildDataSourceMap maps each display name back to its Data/ source (copy == reference)", () => {
  const empty = new Uint8Array();
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/img_percy-4113.jpg", empty],
    ["Data/shot-10.png", empty],
    ["Data/shot-20.png", empty],
  ]);

  const sources = buildDataSourceMap(dataFiles);
  // The stripped display name resolves back to the suffixed source bytes.
  assert.equal(sources.get("img_percy.jpg"), "img_percy-4113.jpg");
  // Colliding assets resolve to themselves (source == display), so each is copied.
  assert.equal(sources.get("shot-10.png"), "shot-10.png");
  assert.equal(sources.get("shot-20.png"), "shot-20.png");

  // The name referenced in the MDX (via buildDataFileNameMap) is exactly the key
  // that buildDataSourceMap resolves, so the copied file always matches the src.
  const referenced = buildDataFileNameMap(dataFiles);
  for (const fileName of referenced.values()) {
    assert.ok(sources.has(fileName), `${fileName} should resolve to a source`);
  }
});

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

test("imageFromArchive resolves via the Data/ filename map (primary)", () => {
  const dataFileNames = new Map<number, string>([[479, "unite-cardreader-small-479.jpg"]]);
  const image = {
    super: { accessibilityDescription: "a chart" },
    data: { identifier: 479n },
  } as ImageArchive;

  assert.deepEqual(imageFromArchive(image, dataFileNames, new Map(), "a chart"), {
    fileName: "unite-cardreader-small-479.jpg",
    altText: "a chart",
  });
});

test("imageFromArchive falls back to the datas map when the Data/ map misses", () => {
  const dataInfo = new Map<bigint, string>([[100n, "shot.png"]]);
  const image = { data: { identifier: 100n } } as ImageArchive;

  assert.equal(imageFromArchive(image, new Map(), dataInfo, "")?.fileName, "shot.png");
});

test("imageFromArchive falls back to originalData and returns null when unmapped", () => {
  const dataInfo = new Map<bigint, string>([[55n, "orig.png"]]);
  const viaOriginal = { originalData: { identifier: 55n } } as ImageArchive;
  assert.equal(imageFromArchive(viaOriginal, new Map(), dataInfo, "")?.fileName, "orig.png");

  const unmapped = { data: { identifier: 999n } } as ImageArchive;
  assert.equal(imageFromArchive(unmapped, new Map(), dataInfo, ""), null);
});

test("distinctImageFileNames collapses reused occurrences to unique file names", () => {
  const empty = new Uint8Array();
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/chart-10.png", empty],
    ["Data/logo-20.png", empty],
  ]);
  // Three ImageArchives, but two reuse the same backing asset (id 10).
  const registry = buildRegistry([
    mockObject(1n, KeynoteType.imageArchive, { data: { identifier: 10n } }),
    mockObject(2n, KeynoteType.imageArchive, { data: { identifier: 10n } }),
    mockObject(3n, KeynoteType.imageArchive, { data: { identifier: 20n } }),
    // Unresolvable backing data must not inflate the distinct count.
    mockObject(4n, KeynoteType.imageArchive, { data: { identifier: 999n } }),
  ]);

  const names = distinctImageFileNames(registry, dataFiles);
  assert.deepEqual([...names].sort(), ["chart.png", "logo.png"]);
});

test("imageCoverageWarning reports occurrence + distinct coverage and appends the unlinked clause", () => {
  const warning = imageCoverageWarning({
    placedOccurrences: 24,
    totalOccurrences: 36,
    placedDistinct: 21,
    totalDistinct: 21,
  });
  assert.equal(
    warning,
    "Placed 24 of 36 image occurrences (21 of 21 distinct images); 12 occurrence(s) could not be linked to a slide",
  );
});

test("imageCoverageWarning is null when every occurrence is placed", () => {
  assert.equal(
    imageCoverageWarning({ placedOccurrences: 36, totalOccurrences: 36, placedDistinct: 21, totalDistinct: 21 }),
    null,
  );
  assert.equal(
    imageCoverageWarning({ placedOccurrences: 0, totalOccurrences: 0, placedDistinct: 0, totalDistinct: 0 }),
    null,
  );
});
