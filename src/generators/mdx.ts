import * as path from "node:path";

export interface FrontmatterData {
  title: string;
  subtitle: string;
  description: string;
  company: {
    name: string;
    position: string;
  };
  event: {
    name: string;
    url: string;
  };
  keywords: string[];
  [key: string]: unknown;
}

/**
 * Emits presentation metadata as individual MDX `export const` statements — one
 * per top-level field, every field always present (empties included) so the page
 * module exposes a stable shape. Values are JSON-serialized so strings, objects,
 * arrays, and embedded newlines are all safe. `date`/`metadata` are skipped.
 */
export function generateMetadataExports(metadata: Record<string, unknown>): string {
  const fields: FrontmatterData = {
    title: "",
    subtitle: "",
    description: "",
    company: {
      name: "",
      position: "",
    },
    event: {
      name: "",
      url: "",
    },
    keywords: [],
  };

  Object.entries(metadata).forEach(([name, value]) => {
    if (name === "date") return;
    if (name === "metadata") return;
    fields[name] = value;
  });

  return Object.entries(fields)
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join("\n");
}

/** Lowercases, drops non-alphanumerics, and underscores whitespace for a safe filename stem. */
export function sanitizeFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_");
}

/** A date as `YYYY-MM-DD`. */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** The output `.mdx` filename for a presentation: `YYYY-MM-DD_sanitized-title.mdx`. */
export function generateFilename(date: Date, title: string): string {
  return `${formatDate(date)}_${sanitizeFilename(title)}.mdx`;
}

/** Title from the input filename (extension stripped), used when the document carries none. */
export function titleFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export function generateSlideContent(slideContent: string): string {
  // The slide content is already formatted as MDX by the parsers
  return slideContent;
}

export function formatAttributes(attributes: Record<string, unknown> | null): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return "";
  }

  const formattedAttrs: string[] = [];

  Object.entries(attributes).forEach(([key, value]) => {
    if (typeof value === "string") {
      formattedAttrs.push(`${key}="${value}"`);
    } else if (Array.isArray(value)) {
      formattedAttrs.push(`${key}={[${value.join(", ")}]}`);
    }
  });

  return ` ${formattedAttrs.join(" ")}`;
}
