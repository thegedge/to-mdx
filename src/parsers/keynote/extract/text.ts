import type { Paragraph } from "../model.ts";
import type { Registry } from "../registry.ts";
import type { ParagraphStyleArchive, ShapeInfoArchive, StorageArchive } from "../types.ts";
import { fontSizeToken } from "./style.ts";

/**
 * Resolves the text `StorageArchive` owned by a shape/placeholder. iWork keeps
 * the editable text in `owned_storage`, falling back to the older `text_flow`.
 */
export function storageForShape(shape: ShapeInfoArchive | undefined, registry: Registry): StorageArchive | undefined {
  if (!shape) return undefined;
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
  if (!storage) return [];

  const full = storage.text.join("");
  if (!full.trim()) return [];

  const depthAt = buildDepthLookup(storage);
  const fontSizeAt = slideHeightPt ? buildFontSizeLookup(storage, registry, slideHeightPt) : undefined;
  const paragraphs: Paragraph[] = [];

  let charIndex = 0;
  for (const segment of full.split("\n")) {
    const text = segment.trim();
    if (text) {
      // Keep leading whitespace (trailing trimmed) so a fenced-code box can
      // preserve indentation; `raw` is omitted when the line isn't indented.
      const raw = segment.trimEnd();
      const token = fontSizeAt?.(charIndex);
      paragraphs.push({
        depth: depthAt(charIndex),
        text,
        ...(raw === text ? {} : { raw }),
        ...(token ? { fontSizeToken: token } : {}),
      });
    }
    charIndex += segment.length + 1; // +1 for the consumed newline
  }

  return paragraphs;
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
  if (marks.length === 0) return () => undefined;

  return (charIndex: number) => {
    let pt: number | undefined;
    for (const mark of marks) {
      if (mark.at > charIndex) break;
      pt = mark.pt;
    }
    return pt === undefined ? undefined : fontSizeToken(pt, slideHeightPt);
  };
}

function buildDepthLookup(storage: StorageArchive): (charIndex: number) => number {
  const entries = storage.tableParaData?.entries ?? [];
  if (entries.length === 0) return () => 0;

  const marks = entries
    .map((entry) => ({ at: entry.characterIndex, depth: entry.first }))
    .sort((a, b) => a.at - b.at);

  return (charIndex: number) => {
    let depth = 0;
    for (const mark of marks) {
      if (mark.at > charIndex) break;
      depth = mark.depth;
    }
    return depth;
  };
}
