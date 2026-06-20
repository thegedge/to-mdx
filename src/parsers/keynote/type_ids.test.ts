import assert from "node:assert/strict";
import { test } from "node:test";
import { isType, typeIds, typeName } from "./type_ids.ts";

test("typeIds resolves message names to ids via the library registry", () => {
  // Resolved by name from KeynoteArchives, not hardcoded in our code.
  assert.ok(typeIds("ImageArchive").has(3005));
  assert.ok(typeIds("PackageMetadata").has(11006));
  assert.ok(typeIds("MovieArchive").has(3007));
});

test("typeIds returns every id sharing a name", () => {
  // SlideArchive is registered under both 5 and 6; placeholders under 7 and 12.
  assert.deepEqual([...typeIds("SlideArchive")].sort((a, b) => a - b), [5, 6]);
  assert.deepEqual([...typeIds("PlaceholderArchive")].sort((a, b) => a - b), [7, 12]);
});

test("typeName maps an id back to its fully-qualified proto name", () => {
  assert.equal(typeName(3005), "TSD.ImageArchive");
  assert.equal(typeName(11006), "TSP.PackageMetadata");
});

test("isType checks membership by name", () => {
  assert.ok(isType(7, "PlaceholderArchive"));
  assert.ok(!isType(7, "ImageArchive"));
});
