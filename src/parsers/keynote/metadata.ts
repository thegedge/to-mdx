import * as path from "node:path";

export function sanitizeFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_");
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function generateFilename(date: Date, title: string): string {
  return `${formatDate(date)}_${sanitizeFilename(title)}.mdx`;
}

/** Title from the input filename (extension stripped), used when the document carries none. */
export function titleFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
