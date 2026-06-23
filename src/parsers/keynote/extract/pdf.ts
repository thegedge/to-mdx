import * as mupdf from "mupdf";

/**
 * Renders a PDF's first page to an SVG document. Keynote stores some pasted
 * vector art (logos, diagrams) as PDF, which `<img>` cannot display (Firefox in
 * particular), so we rasterless-convert it to inline-able SVG. Returns undefined
 * if the bytes do not parse as a PDF or the conversion fails — callers keep the
 * original asset in that case.
 */
export function pdfToSvg(bytes: Uint8Array): Uint8Array | undefined {
  try {
    const document = mupdf.Document.openDocument(bytes, "application/pdf");
    if (document.countPages() === 0) return undefined;

    const page = document.loadPage(0);
    const buffer = new mupdf.Buffer();
    const writer = new mupdf.DocumentWriter(buffer, "svg", "");
    const device = writer.beginPage(page.getBounds());
    page.run(device, mupdf.Matrix.identity);
    device.close();
    writer.endPage();
    writer.close();

    return new TextEncoder().encode(buffer.asString());
  } catch {
    return undefined;
  }
}

/**
 * Returns a copy of the deck's `Data/` map with every `*.pdf` asset replaced by a
 * converted `*.svg` (same basename). Conversions that fail leave the original PDF
 * untouched. Done once, up front, so filename resolution, rendering, and image
 * extraction all see the `.svg` name with no PDF-specific branching downstream.
 */
export function convertPdfDataFiles(dataFiles: Map<string, Uint8Array>): Map<string, Uint8Array> {
  const converted = new Map<string, Uint8Array>();
  for (const [name, bytes] of dataFiles) {
    if (name.toLowerCase().endsWith(".pdf")) {
      const svg = pdfToSvg(bytes);
      if (svg) {
        converted.set(`${name.slice(0, -".pdf".length)}.svg`, svg);
        continue;
      }
    }
    converted.set(name, bytes);
  }
  return converted;
}
