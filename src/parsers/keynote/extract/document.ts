import type { Presentation, Slide } from "../model.ts";
import type { Registry } from "../registry.ts";
import { KeynoteType, slideArchiveTypes } from "../types.ts";
import type {
  DocumentArchive,
  Reference,
  ShowArchive,
  SlideArchive,
  SlideNodeArchive,
} from "../types.ts";
import { buildDataInfoMap } from "./images.ts";
import { extractSlide } from "./slide.ts";

export function buildPresentation(registry: Registry, fallbackTitle: string): Presentation {
  const dataInfo = buildDataInfoMap(registry);
  const slides = orderedSlideArchives(registry).map((slide) => extractSlide(slide, registry, dataInfo));

  return { title: presentationTitle(slides, fallbackTitle), slides };
}

function presentationTitle(slides: Slide[], fallbackTitle: string): string {
  const firstTitle = slides.find((slide) => slide.title)?.title;
  return firstTitle?.trim() || fallbackTitle;
}

function orderedSlideArchives(registry: Registry): SlideArchive[] {
  const show = findShow(registry);
  const slideRefs = show ? slideReferences(show, registry) : [];

  const refs = slideRefs.length > 0 ? slideRefs : registry.entriesOfType(KeynoteType.slideNodeArchive).map((e) => e.id);

  const slides: SlideArchive[] = [];
  for (const ref of refs) {
    const slide = slideForNode(ref, registry);
    if (slide) slides.push(slide);
  }

  if (slides.length > 0) return slides;

  // Last-ditch fallback: every SlideArchive in the document, unordered.
  return registry
    .entriesOfType(KeynoteType.slideArchive)
    .concat(registry.entriesOfType(KeynoteType.slideArchiveAlt))
    .map((entry) => entry.message as SlideArchive);
}

function findShow(registry: Registry): ShowArchive | undefined {
  const documentEntry = registry.firstOfType(KeynoteType.documentArchive);
  if (documentEntry) {
    const show = registry.resolve<ShowArchive>((documentEntry.message as DocumentArchive).show);
    if (show) return show;
  }
  return registry.firstOfType(KeynoteType.showArchive)?.message as ShowArchive | undefined;
}

function slideReferences(show: ShowArchive, registry: Registry): Array<bigint> {
  const tree = show.slideTree;
  if (!tree) return [];

  if (tree.slides.length > 0) return tree.slides.map((ref) => ref.identifier);

  // No flat list: walk the node tree depth-first from the root.
  const ordered: bigint[] = [];
  const seen = new Set<bigint>();
  const walk = (nodeRef: Reference | undefined): void => {
    if (!nodeRef || seen.has(nodeRef.identifier)) return;
    seen.add(nodeRef.identifier);
    const node = registry.resolve<SlideNodeArchive>(nodeRef);
    if (!node) return;
    ordered.push(nodeRef.identifier);
    for (const child of node.children) walk(child);
  };
  walk(tree.rootSlideNode);
  return ordered;
}

function slideForNode(id: bigint, registry: Registry): SlideArchive | undefined {
  const entry = registry.get(id);
  if (!entry) return undefined;

  if (slideArchiveTypes.has(entry.type)) return entry.message as SlideArchive;

  if (entry.type === KeynoteType.slideNodeArchive) {
    return registry.resolve<SlideArchive>((entry.message as SlideNodeArchive).slide);
  }

  return undefined;
}
