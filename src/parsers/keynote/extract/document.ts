import type { Presentation, Slide } from "../model.ts";
import type { Registry } from "../registry.ts";
import { isType, typeIds } from "../type_ids.ts";
import type {
  DocumentArchive,
  Reference,
  ShowArchive,
  SlideArchive,
  SlideNodeArchive,
} from "../types.ts";
import { buildDataInfoMap } from "./images.ts";
import type { SlideDefaults } from "./slide.ts";
import { extractSlide, NO_DEFAULTS, slidePlaceholderTexts } from "./slide.ts";

export function buildPresentation(registry: Registry, fallbackTitle: string): Presentation {
  const dataInfo = buildDataInfoMap(registry);
  const defaultsFor = makeDefaultsResolver(registry);
  const slides = orderedSlideArchives(registry).map((slide) =>
    extractSlide(slide, registry, dataInfo, defaultsFor(slide)),
  );

  return { title: presentationTitle(slides, fallbackTitle), slides };
}

function presentationTitle(slides: Slide[], fallbackTitle: string): string {
  const firstTitle = slides.find((slide) => slide.title)?.title;
  return firstTitle?.trim() || fallbackTitle;
}

/**
 * Resolves a slide's master ("template") and caches the title/body text it
 * carries, so a slide placeholder still holding that inherited text is treated
 * as empty rather than leaking the layout default (e.g. "Comparison Slide").
 */
function makeDefaultsResolver(registry: Registry): (slide: SlideArchive) => SlideDefaults {
  const cache = new Map<bigint, SlideDefaults>();

  return (slide) => {
    const templateRef = slide.templateSlide;
    if (!templateRef) return NO_DEFAULTS;

    const cached = cache.get(templateRef.identifier);
    if (cached) return cached;

    const master = registry.resolve<SlideArchive>(templateRef);
    const texts = master ? slidePlaceholderTexts(master, registry) : { titles: [], bodies: [] };
    const defaults: SlideDefaults = { titles: new Set(texts.titles), bodies: new Set(texts.bodies) };
    cache.set(templateRef.identifier, defaults);
    return defaults;
  };
}

function orderedSlideArchives(registry: Registry): SlideArchive[] {
  const show = findShow(registry);
  const slideRefs = show ? slideReferences(show, registry) : [];

  const refs =
    slideRefs.length > 0
      ? slideRefs
      : registry.entriesOfTypes(typeIds("SlideNodeArchive")).map((entry) => entry.id);

  const slides: SlideArchive[] = [];
  for (const ref of refs) {
    const slide = slideForNode(ref, registry);
    if (slide) slides.push(slide);
  }

  if (slides.length > 0) return slides;

  // Last-ditch fallback: every SlideArchive in the document, unordered.
  return registry.entriesOfTypes(typeIds("SlideArchive")).map((entry) => entry.message as SlideArchive);
}

function findShow(registry: Registry): ShowArchive | undefined {
  const documentEntry = registry.firstOfTypes(typeIds("DocumentArchive"));
  if (documentEntry) {
    const show = registry.resolve<ShowArchive>((documentEntry.message as DocumentArchive).show);
    if (show) return show;
  }
  return registry.firstOfTypes(typeIds("ShowArchive"))?.message as ShowArchive | undefined;
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

  if (isType(entry.type, "SlideArchive")) return entry.message as SlideArchive;

  if (isType(entry.type, "SlideNodeArchive")) {
    return registry.resolve<SlideArchive>((entry.message as SlideNodeArchive).slide);
  }

  return undefined;
}
