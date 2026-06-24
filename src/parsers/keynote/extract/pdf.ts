import * as mupdf from "mupdf";

/**
 * Renders a PDF's first page to an SVG document. Keynote stores some pasted
 * vector art (logos, diagrams) as PDF, which `<img>` cannot display (Firefox in
 * particular), so we rasterless-convert it to inline-able SVG. Returns undefined
 * if the bytes do not parse as a PDF or the conversion fails — callers keep the
 * original asset in that case.
 */
export function pdfToSvg(bytes: Uint8Array): Uint8Array | undefined {
  return suppressMupdfWarnings(() => {
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
  });
}

/**
 * Runs `fn` with mupdf's stderr chatter ("warning: invalid marked content …")
 * suppressed. mupdf writes these from its WASM layer straight to `stderr`, below
 * the `console` API, so we filter `process.stderr.write` for the duration and
 * always restore it. Our own warnings use a "⚠️" prefix and pass through.
 */
function suppressMupdfWarnings<T>(fn: () => T): T {
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    if (/^warning:/m.test(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString())) return true;
    return (original as (c: string | Uint8Array, ...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  try {
    return fn();
  } finally {
    process.stderr.write = original;
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
