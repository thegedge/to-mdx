import assert from "node:assert/strict";
import { test } from "node:test";
import { partialDecodeWarning, partialEntriesWarning, sortPartialEntries } from "./decode.ts";

test("partialDecodeWarning summarizes failed chunks in one line", () => {
  const warning = partialDecodeWarning(3, 50);
  assert.match(warning ?? "", /3 of 50 \.iwa chunks only partially decoded/);
  assert.match(warning ?? "", /library limitation/);
});

test("partialDecodeWarning is null when nothing failed", () => {
  assert.equal(partialDecodeWarning(0, 50), null);
});

test("sortPartialEntries de-duplicates and sorts the recorded entry names", () => {
  const recorded = ["Index/Slide-19.iwa", "Index/Slide-12.iwa", "Index/Slide-19.iwa", "Index/Metadata.iwa"];
  assert.deepEqual(sortPartialEntries(recorded), [
    "Index/Metadata.iwa",
    "Index/Slide-12.iwa",
    "Index/Slide-19.iwa",
  ]);
});

test("partialEntriesWarning lists every affected .iwa component", () => {
  const warning = partialEntriesWarning(["Index/Slide-12.iwa", "Index/Slide-19.iwa"]);
  assert.equal(warning, "Partial .iwa components: Index/Slide-12.iwa, Index/Slide-19.iwa");
});

test("partialEntriesWarning is null when no entries were affected", () => {
  assert.equal(partialEntriesWarning([]), null);
});
