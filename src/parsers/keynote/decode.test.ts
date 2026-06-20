import assert from "node:assert/strict";
import { test } from "node:test";
import { partialDecodeWarning } from "./decode.ts";

test("partialDecodeWarning summarizes failed chunks in one line", () => {
  const warning = partialDecodeWarning(3, 50);
  assert.match(warning ?? "", /3 of 50 \.iwa chunks only partially decoded/);
  assert.match(warning ?? "", /library limitation/);
});

test("partialDecodeWarning is null when nothing failed", () => {
  assert.equal(partialDecodeWarning(0, 50), null);
});
