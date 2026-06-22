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

/** The `sageTagToInfoMap` tag whose drawable holds a modern slide's real title. */
const SAGE_TITLE_TAG = "Title";

interface Collected {
  titles: Paragraph[][];
  /** Text of the `sageTagToInfoMap` "Title" drawable (modern content-slide title). */
  sageTitle: Paragraph[];
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
    title: pickTitle(slide, collected, defaults.titles),
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
  // Masters carry their default title in the Sage "Title" drawable too, so a
  // content slide inheriting that exact string must be treated as inherited.
  const titles = [...collected.titles.map(joinText), joinText(collected.sageTitle)];
  return {
    titles: titles.filter((text) => text.length > 0),
    bodies: collected.bodies.map(joinText).filter((text) => text.length > 0),
  };
}

function collectFromSlide(slide: SlideArchive, registry: Registry): Collected {
  const collected: Collected = { titles: [], sageTitle: [], bodies: [], textBoxes: [], tableCount: 0 };
  const handled = new Set<bigint>();

  // Modern decks keep a content slide's real title in the Sage-tagged "Title"
  // drawable (the title placeholder is empty). Consume it first and mark it
  // handled so it doesn't also surface as a free text box.
  const sageTitleId = sageTitleDrawableId(slide);
  if (sageTitleId !== undefined) {
    handled.add(sageTitleId);
    collected.sageTitle = drawableParagraphs(sageTitleId, registry);
  }

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

/** Identifier of the `sageTagToInfoMap` entry tagged "Title", if present. */
function sageTitleDrawableId(slide: SlideArchive): bigint | undefined {
  const entry = slide.sageTagToInfoMap?.find((mapEntry) => mapEntry.tag === SAGE_TITLE_TAG);
  return entry?.info?.identifier;
}

/** Text of a drawable referenced by id, whether a shape or a title placeholder. */
function drawableParagraphs(id: bigint, registry: Registry): Paragraph[] {
  const entry = registry.get(id);
  if (!entry) return [];

  if (isType(entry.type, "ShapeInfoArchive")) {
    return extractParagraphs(storageForShape(entry.message as ShapeInfoArchive, registry), registry);
  }
  if (isType(entry.type, "PlaceholderArchive")) {
    return extractParagraphs(storageForShape((entry.message as PlaceholderArchive).super, registry), registry);
  }
  return [];
}

/**
 * Picks the slide's real title, taking the first non-empty, non-inherited
 * candidate in order: the Sage "Title" drawable (modern content slides), then
 * the kind-2 title placeholder, then Keynote's navigator/outline thumbnail.
 */
function pickTitle(slide: SlideArchive, collected: Collected, defaults: Set<string>): string | undefined {
  const sageTitle = joinText(collected.sageTitle);
  if (sageTitle && !defaults.has(sageTitle)) return sageTitle;

  for (const paragraphs of collected.titles) {
    const text = joinText(paragraphs);
    if (text && !defaults.has(text)) return text;
  }

  const thumbnail = (slide.thumbnailTextForTitlePlaceholder ?? "").trim();
  if (thumbnail && !defaults.has(thumbnail)) return thumbnail;

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
