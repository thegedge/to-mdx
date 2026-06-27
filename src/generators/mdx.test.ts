import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, generateFilename, generateMetadataExports, sanitizeFilename, titleFromPath } from "./mdx.ts";

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

test("generateMetadataExports emits every field as an export const, defaults included", () => {
  assert.equal(
    generateMetadataExports({ title: "Network Monitor" }),
    [
      'export const title = "Network Monitor";',
      'export const subtitle = "";',
      'export const description = "";',
      'export const company = {"name":"","position":""};',
      'export const event = {"name":"","url":""};',
      "export const keywords = [];",
    ].join("\n"),
  );
});

test("generateMetadataExports JSON-serializes objects, arrays, and newline strings", () => {
  const mdx = generateMetadataExports({
    company: { name: "Acme", position: "CTO" },
    keywords: ["a", "b"],
    description: "line one\nline two",
  });

  assert.match(mdx, /export const company = \{"name":"Acme","position":"CTO"\};/);
  assert.match(mdx, /export const keywords = \["a","b"\];/);
  assert.match(mdx, /export const description = "line one\\nline two";/);
});

test("generateMetadataExports emits an imageRoot export when provided", () => {
  const mdx = generateMetadataExports({ title: "X", imageRoot: "/img/presentations/2026-01-01_x" });
  assert.match(mdx, /export const imageRoot = "\/img\/presentations\/2026-01-01_x";/);
});

test("generateMetadataExports emits numeric fields (slide size) unquoted", () => {
  const mdx = generateMetadataExports({ title: "X", width: 1920, height: 1080 });
  assert.match(mdx, /export const width = 1920;/);
  assert.match(mdx, /export const height = 1080;/);
});

test("generateMetadataExports skips the date and metadata keys", () => {
  const mdx = generateMetadataExports({ title: "X", date: new Date(), metadata: { foo: 1 } });
  assert.doesNotMatch(mdx, /export const date/);
  assert.doesNotMatch(mdx, /export const metadata/);
  assert.match(mdx, /export const title = "X";/);
});
