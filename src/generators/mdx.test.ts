import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMetadataExports } from "./mdx.ts";

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

test("generateMetadataExports skips the date and metadata keys", () => {
  const mdx = generateMetadataExports({ title: "X", date: new Date(), metadata: { foo: 1 } });
  assert.doesNotMatch(mdx, /export const date/);
  assert.doesNotMatch(mdx, /export const metadata/);
  assert.match(mdx, /export const title = "X";/);
});
