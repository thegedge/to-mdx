import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, generateFilename, sanitizeFilename, titleFromPath } from "./metadata.ts";

test("sanitizeFilename lowercases, strips punctuation and underscores spaces", () => {
  assert.equal(sanitizeFilename("Hello, World! 2026"), "hello_world_2026");
  assert.equal(sanitizeFilename("  Mixed   CASE  "), "_mixed_case_");
});

test("formatDate emits an ISO yyyy-mm-dd string", () => {
  assert.equal(formatDate(new Date("2026-06-20T13:45:00Z")), "2026-06-20");
});

test("generateFilename combines date and sanitized title with .mdx", () => {
  assert.equal(generateFilename(new Date("2026-06-20T00:00:00Z"), "My Talk"), "2026-06-20_my_talk.mdx");
});

test("titleFromPath strips directory and extension", () => {
  assert.equal(titleFromPath("/tmp/decks/Quarterly Review.key"), "Quarterly Review");
  assert.equal(titleFromPath("plain.key"), "plain");
});
