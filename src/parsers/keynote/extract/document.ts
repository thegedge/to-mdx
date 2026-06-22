import type { Presentation, Slide } from "../model.ts";
import type { Registry, RegistryEntry } from "../registry.ts";
import { isType, typeIds } from "../type_ids.ts";
import type {
  DocumentArchive,
  Reference,
  ShowArchive,
  SlideArchive,
  SlideNodeArchive,
} from "../types.ts";
import { buildDataFileNameMap, buildDataInfoMap } from "./images.ts";
import type { SlideDefaults } from "./slide.ts";
import { extractSlide, NO_DEFAULTS, slidePlaceholderTexts } from "./slide.ts";

export function buildPresentation(
  registry: Registry,
  fallbackTitle: string,
  dataFiles: Map<string, Uint8Array> = new Map(),
): Presentation {
  const dataFileNames = buildDataFileNameMap(dataFiles);
  const dataInfo = buildDataInfoMap(registry);
  const defaultsFor = makeDefaultsResolver(registry);
  const slides = orderedSlideArchives(registry).map((entry) => {
    const slide = entry.message as SlideArchive;
    return extractSlide(slide, registry, dataFileNames, dataInfo, defaultsFor(slide));
  });

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

/**
 * The deck's SlideArchive entries in presentation (slide-tree) order. Exported so
 * debug tooling can sample real content slides via the same traversal rather than
 * registry order (which surfaces master/layout templates first).
 */
export function orderedSlideArchives(registry: Registry): RegistryEntry[] {
  const show = findShow(registry);
  const slideRefs = show ? slideReferences(show, registry) : [];

  const refs =
    slideRefs.length > 0
      ? slideRefs
      : registry.entriesOfTypes(typeIds("SlideNodeArchive")).map((entry) => entry.id);

  const slides: RegistryEntry[] = [];
  for (const ref of refs) {
    const slide = slideEntryForNode(ref, registry);
    if (slide) slides.push(slide);
  }

  if (slides.length > 0) return slides;

  // Last-ditch fallback: every SlideArchive in the document, unordered.
  return registry.entriesOfTypes(typeIds("SlideArchive"));
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

function slideEntryForNode(id: bigint, registry: Registry): RegistryEntry | undefined {
  const entry = registry.get(id);
  if (!entry) return undefined;

  if (isType(entry.type, "SlideArchive")) return entry;

  if (isType(entry.type, "SlideNodeArchive")) {
    const slideRef = (entry.message as SlideNodeArchive).slide;
    return slideRef ? registry.get(slideRef.identifier) : undefined;
  }

  return undefined;
}
