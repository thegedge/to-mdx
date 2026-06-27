import type { Paragraph } from "../model.ts";
import type { Registry } from "../registry.ts";
import type { ParagraphStyleArchive, ShapeInfoArchive, StorageArchive } from "../types.ts";
import { fontSizeToken } from "./style.ts";

/**
 * Resolves the text `StorageArchive` owned by a shape/placeholder. iWork keeps
 * the editable text in `owned_storage`, falling back to the older `text_flow`.
 */
export function storageForShape(shape: ShapeInfoArchive | undefined, registry: Registry): StorageArchive | undefined {
  if (!shape) {
    return undefined;
  }
  return registry.resolve<StorageArchive>(shape.ownedStorage) ?? registry.resolve<StorageArchive>(shape.textFlow);
}

/**
 * Splits a `StorageArchive` into paragraphs. The `text` field is an array of
 * string segments; paragraph boundaries are newline characters in the joined
 * text. List/indent depth is read from `tableParaData`, whose entries map a
 * character index to a depth value (`first`).
 *
 * When `slideHeightPt` is supplied, each paragraph also gets its own
 * `fontSizeToken` resolved from the paragraph style covering its start character
 * (slide-height-relative), so a free text box mixing sizes can render each line
 * independently. Omitted otherwise, leaving flow content (headings/bullets/code)
 * a single box-level size.
 */
export function extractParagraphs(
  storage: StorageArchive | undefined,
  registry: Registry,
  slideHeightPt?: number,
): Paragraph[] {
  if (!storage) {
    return [];
  }

  const full = storage.text.join("");
  if (!full.trim()) {
    return [];
  }

  const depthAt = buildDepthLookup(storage);
  const fontSizeAt = slideHeightPt ? buildFontSizeLookup(storage, registry, slideHeightPt) : undefined;
  const linkOver = buildLinkLookup(storage, registry);
  const paragraphs: Paragraph[] = [];

  let charIndex = 0;
  for (const segment of full.split("\n")) {
    const text = segment.trim();
    if (text) {
      // Keep leading whitespace (trailing trimmed) so a fenced-code box can
      // preserve indentation; `raw` is omitted when the line isn't indented.
      const raw = segment.trimEnd();
      const token = fontSizeAt?.(charIndex);
      const link = linkOver(charIndex, charIndex + segment.length);
      paragraphs.push({
        depth: depthAt(charIndex),
        text,
        ...(raw === text ? {} : { raw }),
        ...(token ? { fontSizeToken: token } : {}),
        ...(link ? { link } : {}),
      });
    }
    charIndex += segment.length + 1; // +1 for the consumed newline
  }

  return paragraphs;
}

/**
 * A lookup for the hyperlink (if any) spanning a character range, built from the
 * storage's `tableSmartfield` entries: each entry anchors a link field (carrying a
 * `urlRef`) at a character index, covering the text up to the next field. Returns
 * the URL only when a single link fully covers the requested `[start, end)` range,
 * so a whole-paragraph credit becomes a link while partial links are left alone.
 */
function buildLinkLookup(
  storage: StorageArchive,
  registry: Registry,
): (start: number, end: number) => string | undefined {
  const entries = (storage as unknown as { tableSmartfield?: { entries?: SmartfieldEntry[] } }).tableSmartfield?.entries;
  const links = (entries ?? [])
    .map((entry) => ({
      start: entry.characterIndex ?? 0,
      url: (registry.resolve(entry.object) as { urlRef?: unknown } | undefined)?.urlRef,
    }))
    .filter((link): link is { start: number; url: string } => typeof link.url === "string")
    .sort((a, b) => a.start - b.start);

  if (links.length === 0) {
    return () => undefined;
  }
  return (start, end) => {
    for (let i = 0; i < links.length; i += 1) {
      const linkEnd = i + 1 < links.length ? links[i + 1].start : Infinity;
      if (links[i].start <= start && end <= linkEnd) {
        return links[i].url;
      }
    }
    return undefined;
  };
}

interface SmartfieldEntry {
  characterIndex?: number;
  object?: import("../types.ts").Reference;
}

/**
 * A per-character lookup of the `var(--text-*)` font-size token, built from the
 * storage's paragraph-style runs (`tableParaStyle`): each run maps a start
 * character to a `ParagraphStyleArchive` whose `charProperties.fontSize` (points)
 * is converted via `fontSizeToken`. A character takes the nearest preceding run.
 * Returns a constant `undefined` lookup when no run resolves a size.
 */
function buildFontSizeLookup(
  storage: StorageArchive,
  registry: Registry,
  slideHeightPt: number,
): (charIndex: number) => string | undefined {
  const marks = (storage.tableParaStyle?.entries ?? [])
    .map((entry) => ({
      at: entry.characterIndex ?? 0,
      pt: registry.resolve<ParagraphStyleArchive>(entry.object)?.charProperties?.fontSize,
    }))
    .filter((mark): mark is { at: number; pt: number } => mark.pt !== undefined)
    .sort((a, b) => a.at - b.at);
  if (marks.length === 0) {
    return () => undefined;
  }

  return (charIndex: number) => {
    let pt: number | undefined;
    for (const mark of marks) {
      if (mark.at > charIndex) {
        break;
      }
      pt = mark.pt;
    }
    return pt === undefined ? undefined : fontSizeToken(pt, slideHeightPt);
  };
}

function buildDepthLookup(storage: StorageArchive): (charIndex: number) => number {
  const entries = storage.tableParaData?.entries ?? [];
  if (entries.length === 0) {
    return () => 0;
  }

  const marks = entries
    .map((entry) => ({ at: entry.characterIndex, depth: entry.first }))
    .sort((a, b) => a.at - b.at);

  return (charIndex: number) => {
    let depth = 0;
    for (const mark of marks) {
      if (mark.at > charIndex) {
        break;
      }
      depth = mark.depth;
    }
    return depth;
  };
}
