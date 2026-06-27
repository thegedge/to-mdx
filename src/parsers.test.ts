import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "./parsers.ts";

test("parse rejects unknown file types", async () => {
  await assert.rejects(parse("/out", "deck.pptx", {}), /Unknown file type: deck\.pptx/);
});

test("parse dispatches .key files to the Keynote parser", async () => {
  // Routing reached the Keynote parser if it fails trying to read the (missing)
  // file rather than with the generic "Unknown file type" error.
  await assert.rejects(parse("/out", "/nonexistent/deck.key", {}), (error: Error) => {
    assert.doesNotMatch(error.message, /Unknown file type/);
    return true;
  });
});
