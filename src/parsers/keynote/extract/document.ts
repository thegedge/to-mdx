import type { Presentation, Slide, SlideImage, SlideVideo } from "../model.ts";
import type { Registry, RegistryEntry } from "../registry.ts";
import { isType, typeIds } from "../type_ids.ts";
import { cls } from "../../../utils.ts";
import type {
  DocumentArchive,
  ImageArchive,
  MaskArchive,
  MediaStyleArchive,
  MovieArchive,
  Reference,
  ShowArchive,
  SlideArchive,
  SlideNodeArchive,
} from "../types.ts";
import {
  buildDataFileNameMap,
  buildDataInfoMap,
  distinctImageFileNames,
  imageFromArchive,
  videoFileFromArchive,
} from "./images.ts";
import { drawableGeometry, isFullBleed, normalizeLayoutClass } from "./layout.ts";
import type { LayoutContext } from "./slide.ts";
import { drawableZOrder, owningSlideId } from "./ownership.ts";
import { boxPercent, maskCrop, mediaOpacity } from "./style.ts";
import type { SlideDefaults, SlidePlacements } from "./slide.ts";
import { extractSlide, NO_DEFAULTS, slidePlaceholderTexts } from "./slide.ts";

/** Fallback slide size (16:9 at 1080p) when the document declares none. */
const DEFAULT_SLIDE_SIZE = { width: 1920, height: 1080 };

export function buildPresentation(
  registry: Registry,
  fallbackTitle: string,
  dataFiles: Map<string, Uint8Array> = new Map(),
  useHeuristics = false,
): Presentation {
  const dataFileNames = buildDataFileNameMap(dataFiles);
  const dataInfo = buildDataInfoMap(registry);
  const defaultsFor = makeDefaultsResolver(registry);

  const orderedEntries = orderedSlideArchives(registry);
  const contentSlideIds = new Set(orderedEntries.map((entry) => entry.id));
  const slideSize = resolveSlideSize(registry);
  const placements = placeDrawables(registry, contentSlideIds, dataFileNames, dataInfo, slideSize);
  const masterImagesFor = makeMasterImagesResolver(registry, dataFileNames, dataInfo, slideSize);

  const layout: LayoutContext = { useHeuristics, slideSize };

  const slides = orderedEntries.map((entry) => {
    const slide = entry.message as SlideArchive;
    const extracted = extractSlide(slide, registry, defaultsFor(slide), placements.get(entry.id), layout, dataFileNames);
    const promoted = promoteBackground(extracted, useHeuristics);
    return inheritMasterImages(promoted, masterImagesFor(slide), useHeuristics);
  });

  // A promoted background image stays "placed" even though it left `slide.images`.
  const placed = new Set([
    ...slides.flatMap((slide) => slide.images.map((image) => image.fileName)),
    ...slides.flatMap((slide) => (slide.background ? [slide.background] : [])),
  ]);
  const unplacedImages = [...distinctImageFileNames(registry, dataFiles)]
    .filter((fileName) => !placed.has(fileName))
    .sort();

  return { title: presentationTitle(slides, fallbackTitle), slides, unplacedImages, slideSize };
}

/**
 * Places every ImageArchive/MovieArchive on its owning content slide by walking
 * the drawable's parent chain upward (see `owningSlideId`). This is robust to
 * unknown container types that a top-down drawable traversal would fail to
 * descend into (e.g. animation-build groups), so it — not the text pass — is
 * authoritative for images and movies. Deduped by archive id.
 */
/**
 * Sets a resolved image's `opacity` from its own `MediaStyleArchive`
 * (`image.style` → `mediaProperties.opacity`, walked up the `super` chain), the
 * Style-tab opacity. Left unset for an opaque image so no `opacity` is emitted.
 */
function applyImageOpacity(resolved: SlideImage, image: ImageArchive, registry: Registry): void {
  const opacity = mediaOpacity(registry.resolve<MediaStyleArchive>(image.style));
  if (opacity !== undefined) resolved.opacity = opacity;
}

function placeDrawables(
  registry: Registry,
  contentSlideIds: Set<bigint>,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
  slideSize: { width: number; height: number },
): Map<bigint, SlidePlacements> {
  const placements = new Map<bigint, SlidePlacements>();
  const placed = new Set<bigint>();

  const slotFor = (slideId: bigint): SlidePlacements => {
    const existing = placements.get(slideId);
    if (existing) return existing;
    const slot: SlidePlacements = { images: [], videos: [] };
    placements.set(slideId, slot);
    return slot;
  };

  // A slide's `drawablesZOrder` index → rank map, cached per slide. Lets a placed
  // image/movie inherit the same back-to-front rank its (possibly grouped)
  // drawable holds in the authoritative order; empty for older decks.
  const zOrderMaps = new Map<bigint, Map<bigint, number>>();
  const zOrderMapFor = (slideId: bigint): Map<bigint, number> => {
    const existing = zOrderMaps.get(slideId);
    if (existing) return existing;
    const slide = registry.get(slideId)?.message as SlideArchive | undefined;
    const map = new Map<bigint, number>();
    slide?.drawablesZOrder.forEach((ref, index) => map.set(ref.identifier, index));
    zOrderMaps.set(slideId, map);
    return map;
  };

  for (const entry of registry.entriesOfTypes(typeIds("ImageArchive"))) {
    if (placed.has(entry.id)) continue;
    const slideId = owningSlideId(entry, registry, contentSlideIds);
    if (slideId === undefined) continue;
    const image = entry.message as ImageArchive;
    const resolved = imageFromArchive(image, dataFileNames, dataInfo, image.super?.accessibilityDescription ?? "");
    if (!resolved) continue;
    const imageGeometry = drawableGeometry(image);
    const box = boxPercent(imageGeometry, slideSize);
    if (box) resolved.box = box;
    const maskGeometry = drawableGeometry(registry.resolve<MaskArchive>(image.mask));
    if (imageGeometry && maskGeometry) {
      const crop = maskCrop(imageGeometry, maskGeometry, slideSize);
      if (crop) resolved.crop = crop;
    }
    applyImageOpacity(resolved, image, registry);
    const zOrder = drawableZOrder(entry, registry, zOrderMapFor(slideId));
    if (zOrder !== undefined) resolved.zOrder = zOrder;
    placed.add(entry.id);
    slotFor(slideId).images.push(resolved);
  }

  for (const entry of registry.entriesOfTypes(typeIds("MovieArchive"))) {
    if (placed.has(entry.id)) continue;
    const slideId = owningSlideId(entry, registry, contentSlideIds);
    if (slideId === undefined) continue;
    const movie = entry.message as MovieArchive;
    const fileName = videoFileFromArchive(movie, dataFileNames, dataInfo);
    if (!fileName) continue;
    const video: SlideVideo = { fileName };
    const box = boxPercent(drawableGeometry(movie), slideSize);
    if (box) video.box = box;
    const zOrder = drawableZOrder(entry, registry, zOrderMapFor(slideId));
    if (zOrder !== undefined) video.zOrder = zOrder;
    placed.add(entry.id);
    slotFor(slideId).videos.push(video);
  }

  return placements;
}

/**
 * Promotes a slide's dominant full-bleed image to its background: detects images
 * whose box bleeds across the whole slide, picks the largest by area, sets it as
 * `slide.background`, and drops it from the inline `images` list so it is not
 * double-rendered. The remaining images stay inline (positioned). The inferred
 * `blank` layout class is added only when heuristics are on; the background
 * itself is always promoted.
 */
function promoteBackground(slide: Slide, useHeuristics: boolean): Slide {
  const candidates = slide.images.filter((image): image is SlideImage & { box: NonNullable<SlideImage["box"]> } => {
    // A cropped (masked) image only shows a sub-rectangle, so it must not be
    // promoted to a `cover` background (which would drop the crop).
    return image.crop === undefined && image.box !== undefined && isFullBleed(image.box);
  });
  if (candidates.length === 0) return slide;

  const background = candidates.reduce((best, image) =>
    image.box.width * image.box.height > best.box.width * best.box.height ? image : best,
  );

  const images = slide.images.filter((image) => image !== background);
  const className = useHeuristics ? normalizeLayoutClass(cls(slide.className, "blank") ?? "") || undefined : slide.className;
  return { ...slide, className, background: background.fileName, images };
}

/**
 * Resolves the inheritable images carried by each slide's master ("template")
 * slide, cached per master id because one master is shared by many content
 * slides (so its single image archive must be re-placed on every slide that uses
 * it — it deliberately bypasses the per-archive-id dedup in `placeDrawables`).
 * Only IMAGE drawables are inherited; master title/body shapes are dropped by
 * `makeDefaultsResolver` and ignored here.
 */
function makeMasterImagesResolver(
  registry: Registry,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
  slideSize: { width: number; height: number },
): (slide: SlideArchive) => SlideImage[] {
  const cache = new Map<bigint, SlideImage[]>();

  return (slide) => {
    const templateRef = slide.templateSlide;
    if (!templateRef) return [];

    const cached = cache.get(templateRef.identifier);
    if (cached) return cached;

    const master = registry.resolve<SlideArchive>(templateRef);
    const images = master ? collectMasterImages(master, registry, dataFileNames, dataInfo, slideSize) : [];
    cache.set(templateRef.identifier, images);
    return images;
  };
}

/**
 * Resolves a master slide's image drawables to `SlideImage[]`, reusing the exact
 * image/geometry/crop pipeline `placeDrawables` runs for content images. Walks
 * the master's z-ordered drawables (falling back to `ownedDrawables`) and skips
 * any non-image drawable (shapes) as well as sage-tagged image *placeholders*
 * (e.g. a "Media" photo slot the content slide fills with its own image) — only
 * untagged decorations like logos and backgrounds are inherited.
 */
function collectMasterImages(
  master: SlideArchive,
  registry: Registry,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
  slideSize: { width: number; height: number },
): SlideImage[] {
  const images: SlideImage[] = [];
  const drawables = master.drawablesZOrder.length > 0 ? master.drawablesZOrder : master.ownedDrawables;
  const placeholderIds = new Set(
    (master.sageTagToInfoMap ?? []).flatMap((tag) => (tag.info ? [tag.info.identifier] : [])),
  );

  for (const ref of drawables) {
    if (placeholderIds.has(ref.identifier)) continue;
    const entry = registry.get(ref.identifier);
    if (!entry || !isType(entry.type, "ImageArchive")) continue;

    const image = entry.message as ImageArchive;
    const resolved = imageFromArchive(image, dataFileNames, dataInfo, image.super?.accessibilityDescription ?? "");
    if (!resolved) continue;

    const imageGeometry = drawableGeometry(image);
    const box = boxPercent(imageGeometry, slideSize);
    if (box) resolved.box = box;
    const maskGeometry = drawableGeometry(registry.resolve<MaskArchive>(image.mask));
    if (imageGeometry && maskGeometry) {
      const crop = maskCrop(imageGeometry, maskGeometry, slideSize);
      if (crop) resolved.crop = crop;
    }
    applyImageOpacity(resolved, image, registry);
    images.push(resolved);
  }

  return images;
}

/**
 * Layers a master slide's inherited images onto a content slide. A full-bleed
 * (uncropped) master image fills the slide background only when the slide has no
 * background of its own (the slide's own promoted background always wins);
 * everything else is appended as a positioned inline image. Images whose file
 * name already appears as the slide's background or among its images are skipped,
 * so re-running is idempotent and an image owned by the slide is never doubled.
 */
function inheritMasterImages(slide: Slide, masterImages: SlideImage[], useHeuristics: boolean): Slide {
  if (masterImages.length === 0) return slide;

  let result = slide;
  for (const image of masterImages) {
    if (result.background === image.fileName) continue;
    if (result.images.some((existing) => existing.fileName === image.fileName)) continue;

    const fullBleed = image.crop === undefined && image.box !== undefined && isFullBleed(image.box);
    if (fullBleed) {
      // Own background wins; a full-bleed decoration would clobber content, so
      // skip it entirely when the slide already has one.
      if (result.background) continue;
      const className = useHeuristics
        ? normalizeLayoutClass(cls(result.className, "blank") ?? "") || undefined
        : result.className;
      result = { ...result, className, background: image.fileName };
    } else {
      result = { ...result, images: [...result.images, { ...image }] };
    }
  }

  return result;
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

/**
 * The deck's slide size in points, read from the `ShowArchive`. Degrades to a
 * 16:9 1080p default when the document declares none (kept in sync with
 * `NO_LAYOUT` in slide.ts).
 */
function resolveSlideSize(registry: Registry): { width: number; height: number } {
  const size = findShow(registry)?.size;
  if (size && size.width > 0 && size.height > 0) {
    return { width: size.width, height: size.height };
  }
  return DEFAULT_SLIDE_SIZE;
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
    // Skip hidden ("skipped") slides, mirroring the flat-list path; still recurse
    // into children, which are independent slides in the show tree.
    if (!node.isHidden) ordered.push(nodeRef.identifier);
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
    const node = entry.message as SlideNodeArchive;
    // Keynote marks "skipped" slides hidden on their tree node; exclude them
    // entirely so they don't render and visible slide numbers stay aligned.
    if (node.isHidden) return undefined;
    return node.slide ? registry.get(node.slide.identifier) : undefined;
  }

  return undefined;
}
