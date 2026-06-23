import assert from "node:assert/strict";
import { test } from "node:test";
import { convertPdfDataFiles, pdfToSvg } from "./pdf.ts";

// Minimal one-page PDF (a single stroked line); mupdf repairs the missing xref.
const MINIMAL_PDF = Uint8Array.from(
  Buffer.from(
    "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDEwMF0vQ29udGVudHMgNCAwIFI+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDQwPj5zdHJlYW0KMTAgMTAgbSAxOTAgOTAgbCAyIHcgUwplbmRzdHJlYW0gZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4KJSVFT0Y=",
    "base64",
  ),
);

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

test("pdfToSvg renders a PDF's first page to an SVG document", () => {
  const svg = pdfToSvg(MINIMAL_PDF);
  assert.ok(svg, "expected SVG bytes");
  assert.match(decode(svg), /<svg[\s>]/);
});

test("pdfToSvg returns undefined for non-PDF bytes", () => {
  assert.equal(pdfToSvg(new TextEncoder().encode("not a pdf")), undefined);
});

test("convertPdfDataFiles replaces a .pdf asset with a converted .svg, leaving others untouched", () => {
  const png = new Uint8Array([1, 2, 3]);
  const input = new Map<string, Uint8Array>([
    ["Data/pasted-image-3754.pdf", MINIMAL_PDF],
    ["Data/photo-100.png", png],
  ]);

  const result = convertPdfDataFiles(input);

  assert.ok(!result.has("Data/pasted-image-3754.pdf"), "original PDF entry is replaced");
  const svg = result.get("Data/pasted-image-3754.svg");
  assert.ok(svg, "converted SVG entry exists under the same basename");
  assert.match(decode(svg), /<svg[\s>]/);
  assert.equal(result.get("Data/photo-100.png"), png, "non-PDF assets pass through unchanged");
});

test("convertPdfDataFiles keeps the original asset when conversion fails", () => {
  const broken = new TextEncoder().encode("%PDF-broken");
  const result = convertPdfDataFiles(new Map([["Data/x-1.pdf", broken]]));

  assert.equal(result.get("Data/x-1.pdf"), broken);
  assert.ok(!result.has("Data/x-1.svg"));
});
