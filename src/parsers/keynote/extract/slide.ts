import type { Paragraph, Slide, SlideImage } from "../model.ts";
import type { Registry } from "../registry.ts";
import {
  KeynoteType,
  placeholderTypes,
} from "../types.ts";
import type {
  GroupArchive,
  ImageArchive,
  NoteArchive,
  PlaceholderArchive,
  Reference,
  ShapeInfoArchive,
  SlideArchive,
  StorageArchive,
} from "../types.ts";
import { imageFromArchive } from "./images.ts";
import { extractParagraphs, storageForShape } from "./text.ts";

export function extractSlide(slide: SlideArchive, registry: Registry, dataInfo: Map<bigint, string>): Slide {
  const titleParagraphs = placeholderParagraphs(slide.titlePlaceholder, registry);
  const body = placeholderParagraphs(slide.bodyPlaceholder, registry);

  const result: Slide = {
    title: titleParagraphs.map((p) => p.text).join(" ") || undefined,
    body,
    textBoxes: [],
    images: [],
    tableCount: 0,
    notes: notesParagraphs(slide.note, registry),
  };

  const handled = referencedIds([slide.titlePlaceholder, slide.bodyPlaceholder]);
  const drawables = slide.drawablesZOrder.length > 0 ? slide.drawablesZOrder : slide.ownedDrawables;
  for (const ref of drawables) {
    collectDrawable(ref, registry, dataInfo, result, handled);
  }

  return result;
}

function collectDrawable(
  ref: Reference,
  registry: Registry,
  dataInfo: Map<bigint, string>,
  slide: Slide,
  handled: Set<bigint>,
): void {
  if (handled.has(ref.identifier)) return;
  handled.add(ref.identifier);

  const entry = registry.get(ref.identifier);
  if (!entry) return;

  if (entry.type === KeynoteType.imageArchive) {
    const image = addImage(entry.message as ImageArchive, dataInfo);
    if (image) slide.images.push(image);
    return;
  }

  if (entry.type === KeynoteType.groupArchive) {
    for (const child of (entry.message as GroupArchive).children) {
      collectDrawable(child, registry, dataInfo, slide, handled);
    }
    return;
  }

  if (entry.type === KeynoteType.tableInfoArchive) {
    slide.tableCount += 1;
    return;
  }

  if (entry.type === KeynoteType.shapeInfoArchive) {
    const paragraphs = extractParagraphs(storageForShape(entry.message as ShapeInfoArchive, registry), registry);
    if (paragraphs.length > 0) slide.textBoxes.push(paragraphs);
    return;
  }

  if (placeholderTypes.has(entry.type)) {
    const paragraphs = placeholderParagraphsFor(entry.message as PlaceholderArchive, registry);
    if (paragraphs.length > 0) slide.textBoxes.push(paragraphs);
  }
}

function addImage(image: ImageArchive, dataInfo: Map<bigint, string>): SlideImage | null {
  const altText = image.super?.accessibilityDescription ?? "";
  return imageFromArchive(image, dataInfo, altText);
}

function placeholderParagraphs(ref: Reference | undefined, registry: Registry): Paragraph[] {
  const placeholder = registry.resolve<PlaceholderArchive>(ref);
  return placeholderParagraphsFor(placeholder, registry);
}

function placeholderParagraphsFor(placeholder: PlaceholderArchive | undefined, registry: Registry): Paragraph[] {
  if (!placeholder) return [];
  return extractParagraphs(storageForShape(placeholder.super, registry), registry);
}

function notesParagraphs(ref: Reference | undefined, registry: Registry): Paragraph[] {
  const note = registry.resolve<NoteArchive>(ref);
  if (!note) return [];
  return extractParagraphs(registry.resolve<StorageArchive>(note.containedStorage), registry);
}

function referencedIds(refs: Array<Reference | undefined>): Set<bigint> {
  const ids = new Set<bigint>();
  for (const ref of refs) {
    if (ref) ids.add(ref.identifier);
  }
  return ids;
}
