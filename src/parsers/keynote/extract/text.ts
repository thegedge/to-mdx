import type { Paragraph } from "../model.ts";
import type { Registry } from "../registry.ts";
import type { ShapeInfoArchive, StorageArchive } from "../types.ts";

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
 */
export function extractParagraphs(storage: StorageArchive | undefined, _registry: Registry): Paragraph[] {
  if (!storage) return [];

  const full = storage.text.join("");
  if (!full.trim()) return [];

  const depthAt = buildDepthLookup(storage);
  const paragraphs: Paragraph[] = [];

  let charIndex = 0;
  for (const segment of full.split("\n")) {
    const text = segment.trim();
    if (text) {
      // Keep leading whitespace (trailing trimmed) so a fenced-code box can
      // preserve indentation; `raw` is omitted when the line isn't indented.
      const raw = segment.trimEnd();
      paragraphs.push({ depth: depthAt(charIndex), text, ...(raw === text ? {} : { raw }) });
    }
    charIndex += segment.length + 1; // +1 for the consumed newline
  }

  return paragraphs;
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
