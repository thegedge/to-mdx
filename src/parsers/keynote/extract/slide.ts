import type { Paragraph, Slide, SlideImage, TextBox } from "../model.ts";
import type { Registry } from "../registry.ts";
import { isType } from "../type_ids.ts";
import { PlaceholderKind } from "../types.ts";
import type {
  GroupArchive,
  NoteArchive,
  PlaceholderArchive,
  Reference,
  ShapeInfoArchive,
  SlideArchive,
  StorageArchive,
} from "../types.ts";
import { asTextBox } from "./code.ts";
import { extractParagraphs, storageForShape } from "./text.ts";

/** Title/body text inherited from a slide's master, treated as "empty" if unchanged. */
export interface SlideDefaults {
  titles: Set<string>;
  bodies: Set<string>;
}

export const NO_DEFAULTS: SlideDefaults = { titles: new Set(), bodies: new Set() };

/** Images/movies resolved for a slide bottom-up (by owner), supplied to extraction. */
export interface SlidePlacements {
  images: SlideImage[];
  videos: string[];
}

const NO_PLACEMENTS: SlidePlacements = { images: [], videos: [] };

type Role = "title" | "body" | undefined;

interface Collected {
  titles: Paragraph[][];
  bodies: Paragraph[][];
  textBoxes: TextBox[];
  tableCount: number;
}

export function extractSlide(
  slide: SlideArchive,
  registry: Registry,
  defaults: SlideDefaults = NO_DEFAULTS,
  placements: SlidePlacements = NO_PLACEMENTS,
): Slide {
  const collected = collectFromSlide(slide, registry);

  return {
    title: pickTitle(slide, collected.titles, defaults.titles),
    body: pickBody(collected.bodies, defaults.bodies),
    textBoxes: collected.textBoxes,
    images: placements.images,
    videos: placements.videos,
    tableCount: collected.tableCount,
    notes: notesParagraphs(slide.note, registry),
  };
}

/** Title/body placeholder texts of a (master) slide, used to detect inherited defaults. */
export function slidePlaceholderTexts(slide: SlideArchive, registry: Registry): { titles: string[]; bodies: string[] } {
  const collected = collectFromSlide(slide, registry);
  return {
    titles: collected.titles.map(joinText).filter((text) => text.length > 0),
    bodies: collected.bodies.map(joinText).filter((text) => text.length > 0),
  };
}

function collectFromSlide(slide: SlideArchive, registry: Registry): Collected {
  const collected: Collected = { titles: [], bodies: [], textBoxes: [], tableCount: 0 };
  const handled = new Set<bigint>();

  // Process the explicit title/body refs first: their role is authoritative even
  // on older files that omit the placeholder `kind` discriminator.
  processRef(slide.titlePlaceholder, "title", registry, collected, handled);
  processRef(slide.bodyPlaceholder, "body", registry, collected, handled);

  const drawables = slide.drawablesZOrder.length > 0 ? slide.drawablesZOrder : slide.ownedDrawables;
  for (const ref of drawables) {
    processRef(ref, undefined, registry, collected, handled);
  }

  return collected;
}

// Images and movies are placed bottom-up (see extract/document.ts); this top-down
// pass only collects text, placeholders, and tables.
function processRef(
  ref: Reference | undefined,
  role: Role,
  registry: Registry,
  collected: Collected,
  handled: Set<bigint>,
): void {
  if (!ref || handled.has(ref.identifier)) return;
  handled.add(ref.identifier);

  const entry = registry.get(ref.identifier);
  if (!entry) return;

  if (isType(entry.type, "GroupArchive")) {
    for (const child of (entry.message as GroupArchive).children) {
      processRef(child, undefined, registry, collected, handled);
    }
    return;
  }

  if (isType(entry.type, "TableInfoArchive")) {
    collected.tableCount += 1;
    return;
  }

  if (isType(entry.type, "PlaceholderArchive")) {
    const placeholder = entry.message as PlaceholderArchive;
    const resolvedRole = role ?? roleFromKind(placeholder.kind);
    const paragraphs = extractParagraphs(storageForShape(placeholder.super, registry), registry);
    bucketParagraphs(resolvedRole, paragraphs, collected);
    return;
  }

  if (isType(entry.type, "ShapeInfoArchive")) {
    const paragraphs = extractParagraphs(storageForShape(entry.message as ShapeInfoArchive, registry), registry);
    bucketParagraphs(role, paragraphs, collected);
  }
}

function bucketParagraphs(role: Role, paragraphs: Paragraph[], collected: Collected): void {
  if (role === "title") {
    collected.titles.push(paragraphs);
    return;
  }
  if (role === "body") {
    collected.bodies.push(paragraphs);
    return;
  }
  if (paragraphs.length > 0) collected.textBoxes.push(asTextBox(paragraphs));
}

function roleFromKind(kind: number | undefined): Role {
  if (kind === PlaceholderKind.title) return "title";
  if (kind === PlaceholderKind.body) return "body";
  return undefined;
}

/**
 * Picks the slide's real title. `thumbnailTextForTitlePlaceholder` is Keynote's
 * authoritative navigator/outline title, so it wins when present; otherwise the
 * first title placeholder whose text isn't the master's inherited default.
 */
function pickTitle(slide: SlideArchive, titles: Paragraph[][], defaults: Set<string>): string | undefined {
  const thumbnail = (slide.thumbnailTextForTitlePlaceholder ?? "").trim();
  if (thumbnail && !defaults.has(thumbnail)) return thumbnail;

  for (const paragraphs of titles) {
    const text = joinText(paragraphs);
    if (text && !defaults.has(text)) return text;
  }
  return undefined;
}

function pickBody(bodies: Paragraph[][], defaults: Set<string>): Paragraph[] {
  for (const paragraphs of bodies) {
    const text = joinText(paragraphs);
    if (text && !defaults.has(text)) return paragraphs;
  }
  return [];
}

function joinText(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) => paragraph.text)
    .join(" ")
    .trim();
}

function notesParagraphs(ref: Reference | undefined, registry: Registry): Paragraph[] {
  const note = registry.resolve<NoteArchive>(ref);
  if (!note) return [];
  return extractParagraphs(registry.resolve<StorageArchive>(note.containedStorage), registry);
}
