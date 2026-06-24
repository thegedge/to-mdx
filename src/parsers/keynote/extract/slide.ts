import type { Paragraph, Slide, SlideImage, SlideVideo, SvgPath, TableData, TextBox, TextBoxStyle } from "../model.ts";
import type { Registry } from "../registry.ts";
import { isType } from "../type_ids.ts";
import { PlaceholderKind } from "../types.ts";
import type {
  FillArchive,
  GroupArchive,
  NoteArchive,
  PlaceholderArchive,
  Reference,
  ShapeInfoArchive,
  ShapeStyleArchive,
  SlideArchive,
  SlideStyleArchive,
  SlideStylePropertiesArchive,
  StorageArchive,
  TableInfoArchive,
} from "../types.ts";
import { extractTable } from "./table.ts";
import { effectiveShapeProps, resolveFill, shapeBorder, shapeBorderRadius, shapeOpacity, shapeTextShadow, svgPath } from "./shapes.ts";
import { asTextBox } from "./code.ts";
import { contentBoxPercent, drawableGeometry, type RawBox, slideLayoutClass } from "./layout.ts";
import { boxPercent, colorToHex, fillColorCss, hasRgb, textBoxStyle } from "./style.ts";
import { firstInSuperChain, type SuperChainNode } from "./super-chain.ts";
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
  videos: SlideVideo[];
}

const NO_PLACEMENTS: SlidePlacements = { images: [], videos: [] };

/** Slide-size + heuristics gate threaded in for layout classification. */
export interface LayoutContext {
  useHeuristics: boolean;
  slideSize: { width: number; height: number };
}

export const NO_LAYOUT: LayoutContext = { useHeuristics: false, slideSize: { width: 1920, height: 1080 } };

type Role = "title" | "body" | undefined;

/**
 * `sageTagToInfoMap` tags whose drawable holds a modern slide's title, in
 * preference order: an explicit `Title` wins, else a `Subheading` stands in.
 */
const SAGE_TITLE_TAGS = ["Title", "Subheading"] as const;

/** `sageTagToInfoMap` tags whose drawable holds modern slide body content. */
const SAGE_BODY_TAGS = new Set(["Bullets", "Body"]);

interface Collected {
  titles: Paragraph[][];
  /** Text of the `sageTagToInfoMap` "Title" drawable (modern content-slide title). */
  sageTitle: Paragraph[];
  bodies: Paragraph[][];
  textBoxes: TextBox[];
  /** No-text vector shapes (lines/arrows/icons), baked into absolute slide coords. */
  shapes: SvgPath[];
  tables: TableData[];
  tableCount: number;
  /** Geometry of contentful drawables, in slide (point) coordinates, for layout heuristics. */
  geometries: RawBox[];
  /** Slide size (points), used to express free text-box geometry as percentages. */
  slideSize: { width: number; height: number };
}

export function extractSlide(
  slide: SlideArchive,
  registry: Registry,
  defaults: SlideDefaults = NO_DEFAULTS,
  placements: SlidePlacements = NO_PLACEMENTS,
  layout: LayoutContext = NO_LAYOUT,
  dataFileNames: Map<number, string> = new Map(),
): Slide {
  const collected = collectFromSlide(slide, registry, layout.slideSize);
  const title = pickTitle(slide, collected, defaults.titles);
  const background = slideBackground(slide, registry, dataFileNames);

  return {
    className: layout.useHeuristics ? classifyLayout(slide, registry, collected, layout.slideSize, title) : undefined,
    ...background,
    title,
    body: pickBody(collected.bodies, defaults.bodies),
    textBoxes: collected.textBoxes,
    ...(collected.shapes.length > 0 ? { shapes: collected.shapes } : {}),
    images: placements.images,
    videos: placements.videos,
    tables: collected.tables,
    tableCount: collected.tableCount,
    notes: notesParagraphs(slide.note, registry),
  };
}

function classifyLayout(
  slide: SlideArchive,
  registry: Registry,
  collected: Collected,
  slideSize: { width: number; height: number },
  title: string | undefined,
): string | undefined {
  return slideLayoutClass({
    masterName: masterName(slide, registry),
    title,
    contentBox: contentBoxPercent(collected.geometries, slideSize),
  });
}

/**
 * A node in a slide style's inheritance chain. As with shape styles, the real
 * `slideProperties` may sit one level down the inherited `super` (typed as a bare
 * `TSS.StyleArchive` but slide-style-shaped at runtime), so we model it
 * structurally to walk it without casts.
 */
type SlideStyleNode = SuperChainNode<{ slideProperties?: SlideStylePropertiesArchive }>;

/**
 * A slide's resolved background, merged onto the `Slide`: either a solid
 * `backgroundColor` (`#RRGGBB`), or a `background` image file name plus an optional
 * `backgroundTint` overlay color. Empty (all absent) when nothing resolves.
 */
interface SlideBackground {
  backgroundColor?: string;
  background?: string;
  backgroundTint?: string;
}

/**
 * The slide's background, resolved from its style by walking the `super` chain to
 * the first `slideProperties.fill` that carries a usable fill:
 *  - a solid color → `{ backgroundColor: #RRGGBB }` (unchanged behavior);
 *  - an image fill whose `imagedata` resolves to a file name → `{ background, and
 *    backgroundTint }` (the tint as `#rrggbb`/`rgba(...)`, omitted when absent).
 * Gradients (and image fills that don't resolve to a file) are skipped, continuing
 * up the chain; an empty result when nothing resolves.
 */
function slideBackground(
  slide: SlideArchive,
  registry: Registry,
  dataFileNames: Map<number, string>,
): SlideBackground {
  // `super` is typed as a bare `TSS.StyleArchive` but is slide-style-shaped at
  // runtime, so we reinterpret the resolved style as a `SlideStyleNode`.
  const node = registry.resolve<SlideStyleArchive>(slide.style) as unknown as SlideStyleNode | undefined;
  const background = firstInSuperChain(node, (link): SlideBackground | undefined => {
    const fill = link.slideProperties?.fill;
    if (!fill) {
      return undefined;
    }
    if (hasRgb(fill.color)) {
      return { backgroundColor: colorToHex(fill.color) };
    }
    const fileName = imageFillFileName(fill, dataFileNames);
    if (fileName) {
      const tint = fillColorCss(resolveFill(fill));
      return { background: fileName, ...(tint ? { backgroundTint: tint } : {}) };
    }
    return undefined;
  });
  return background ?? {};
}

/** Resolves an image fill's backing data file via `imagedata.identifier`; undefined when it can't. */
function imageFillFileName(fill: FillArchive, dataFileNames: Map<number, string>): string | undefined {
  const id = fill.image?.imagedata?.identifier;
  return id === undefined ? undefined : dataFileNames.get(Number(id));
}

/** The slide's master ("template") name, used to map to a layout class. */
function masterName(slide: SlideArchive, registry: Registry): string | undefined {
  const ref = slide.templateSlide;
  if (!ref) {
    return undefined;
  }
  return registry.resolve<SlideArchive>(ref)?.name;
}

/** Title/body placeholder texts of a (master) slide, used to detect inherited defaults. */
export function slidePlaceholderTexts(slide: SlideArchive, registry: Registry): { titles: string[]; bodies: string[] } {
  const collected = collectFromSlide(slide, registry, NO_LAYOUT.slideSize);
  // Masters carry their default title in the Sage "Title" drawable too, so a
  // content slide inheriting that exact string must be treated as inherited.
  const titles = [...collected.titles.map(joinText), joinText(collected.sageTitle)];
  return {
    titles: titles.filter((text) => text.length > 0),
    bodies: collected.bodies.map(joinText).filter((text) => text.length > 0),
  };
}

function collectFromSlide(
  slide: SlideArchive,
  registry: Registry,
  slideSize: { width: number; height: number },
): Collected {
  const collected: Collected = {
    titles: [],
    sageTitle: [],
    bodies: [],
    textBoxes: [],
    shapes: [],
    tables: [],
    tableCount: 0,
    geometries: [],
    slideSize,
  };
  const handled = new Set<bigint>();

  // Modern decks express a content slide's title/body through Sage-tagged free
  // text boxes (the title/body placeholders are empty). Consume those first and
  // mark every tagged drawable handled so none also surfaces as a free text box.
  const sage = collectSageTags(slide);
  for (const id of sage.handledIds) handled.add(id);

  if (sage.titleId !== undefined) {
    collected.sageTitle = drawableParagraphs(sage.titleId, registry);
    if (collected.sageTitle.length > 0) {
      pushGeometry(registry.get(sage.titleId)?.message, collected);
    }
  }
  for (const bodyId of sage.bodyIds) {
    const paragraphs = drawableParagraphs(bodyId, registry);
    if (paragraphs.length > 0) {
      collected.bodies.push(paragraphs);
      pushGeometry(registry.get(bodyId)?.message, collected);
    }
  }

  // Process the explicit title/body refs first: their role is authoritative even
  // on older files that omit the placeholder `kind` discriminator.
  processRef(slide.titlePlaceholder, "title", registry, collected, handled);
  processRef(slide.bodyPlaceholder, "body", registry, collected, handled);

  // `drawablesZOrder` is authoritative back-to-front order (later = nearer front),
  // so each free box/shape carries its index as `zOrder`. The `ownedDrawables`
  // fallback has no authoritative order, so its drawables stay unranked.
  const zOrdered = slide.drawablesZOrder.length > 0;
  const drawables = zOrdered ? slide.drawablesZOrder : slide.ownedDrawables;
  drawables.forEach((ref, index) => {
    processRef(ref, undefined, registry, collected, handled, zOrdered ? index : undefined);
  });

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
  zOrder?: number,
): void {
  if (!ref || handled.has(ref.identifier)) {
    return;
  }
  handled.add(ref.identifier);

  const entry = registry.get(ref.identifier);
  if (!entry) {
    return;
  }

  if (isType(entry.type, "GroupArchive")) {
    // Grouped children share their group's z-order rank.
    for (const child of (entry.message as GroupArchive).children) {
      processRef(child, undefined, registry, collected, handled, zOrder);
    }
    return;
  }

  if (isType(entry.type, "TableInfoArchive")) {
    const table = extractTable(entry.message as TableInfoArchive, registry);
    if (table) {
      const box = boxPercent(drawableGeometry(entry.message), collected.slideSize);
      if (box) {
        table.box = box;
      }
      collected.tables.push(table);
    } else {
      collected.tableCount += 1;
    }
    return;
  }

  if (isType(entry.type, "ImageArchive")) {
    // Images are placed bottom-up; here we only record geometry for layout heuristics.
    pushGeometry(entry.message, collected);
    return;
  }

  if (isType(entry.type, "PlaceholderArchive")) {
    const placeholder = entry.message as PlaceholderArchive;
    const resolvedRole = role ?? roleFromKind(placeholder.kind);
    const storage = storageForShape(placeholder.super, registry);
    // A non-title/body placeholder can surface as a free positioned text box, so
    // resolve per-paragraph sizes (slide-height-relative) for the mixed-size case.
    const paragraphs = extractParagraphs(storage, registry, collected.slideSize.height);
    collectText(resolvedRole, paragraphs, placeholder, storage, registry, collected, undefined, undefined, zOrder);
    if (paragraphs.length > 0) {
      pushGeometry(placeholder, collected);
    }
    return;
  }

  if (isType(entry.type, "ShapeInfoArchive")) {
    const shape = entry.message as ShapeInfoArchive;
    const storage = storageForShape(shape, registry);
    // Free shape-backed text boxes may mix paragraph sizes (e.g. a big stat over a
    // small label), so resolve each paragraph's own slide-height-relative token.
    const paragraphs = extractParagraphs(storage, registry, collected.slideSize.height);
    if (paragraphs.length === 0) {
      collectShape(shape, registry, collected, zOrder);
      return;
    }
    // A free shape-backed text box can carry its shape's fill as a background and
    // a rounded-rect corner radius; placeholder boxes pass neither, so their flow
    // text stays unstyled (#1).
    const shapeStyle = registry.resolve<ShapeStyleArchive>(shape.super?.style);
    collectText(role, paragraphs, shape, storage, registry, collected, shapeStyle, shapeBorderRadius(shape), zOrder);
    pushGeometry(shape, collected);
  }
}

/** Collects a no-text shape's vector path (a line/arrow/icon); any shape with a drawable path renders. */
function collectShape(shape: ShapeInfoArchive, registry: Registry, collected: Collected, zOrder?: number): void {
  const style = registry.resolve<ShapeStyleArchive>(shape.super?.style);
  const path = svgPath(shape, style);
  if (path) {
    collected.shapes.push(zOrder === undefined ? path : { ...path, zOrder });
  }
}

/**
 * Buckets a drawable's paragraphs as title/body, or — when it carries no
 * placeholder role — as a free text box, lifting its positioning and visual
 * style so the renderer can place it absolutely (code boxes stay unstyled).
 */
function collectText(
  role: Role,
  paragraphs: Paragraph[],
  message: unknown,
  storage: StorageArchive | undefined,
  registry: Registry,
  collected: Collected,
  shapeStyle?: ShapeStyleArchive,
  borderRadius?: string,
  zOrder?: number,
): void {
  if (bucketParagraphs(role, paragraphs, collected) || paragraphs.length === 0) {
    return;
  }
  collected.textBoxes.push(
    freeTextBox(paragraphs, message, storage, registry, collected.slideSize, shapeStyle, borderRadius, zOrder),
  );
}

/**
 * Builds a free text box, attaching geometry/style only to prose (not code)
 * boxes. The visual style merges the text's own font/color/stroke with a
 * `backgroundColor` resolved from the box's shape fill (a solid color, or an
 * image fill's tint) via the same effective-props walk shapes use.
 */
function freeTextBox(
  paragraphs: Paragraph[],
  message: unknown,
  storage: StorageArchive | undefined,
  registry: Registry,
  slideSize: { width: number; height: number },
  shapeStyle?: ShapeStyleArchive,
  borderRadius?: string,
  zOrder?: number,
): TextBox {
  const textBox = asTextBox(paragraphs);
  if (textBox.kind !== "text") {
    return textBox;
  }

  const box = boxPercent(drawableGeometry(message), slideSize);
  const textStyle = textBoxStyle(storage, registry, slideSize.height);
  const backgroundColor = fillColorCss(resolveFill(effectiveShapeProps(shapeStyle)?.fill));
  const border = shapeBorder(shapeStyle);
  const opacity = shapeOpacity(shapeStyle);
  const textShadow = shapeTextShadow(shapeStyle);
  const style: TextBoxStyle = {
    ...textStyle,
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(border ? { border } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(textShadow ? { textShadow } : {}),
  };
  return {
    ...textBox,
    ...(box ? { box } : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
    ...(zOrder !== undefined ? { zOrder } : {}),
  };
}

/** Records a drawable's geometry (walked through its `super` chain) for layout heuristics. */
function pushGeometry(message: unknown, collected: Collected): void {
  const box = drawableGeometry(message);
  if (box) {
    collected.geometries.push(box);
  }
}

/** Files title/body paragraphs by role. Returns whether the role consumed them. */
function bucketParagraphs(role: Role, paragraphs: Paragraph[], collected: Collected): boolean {
  if (role === "title") {
    collected.titles.push(paragraphs);
    return true;
  }
  if (role === "body") {
    collected.bodies.push(paragraphs);
    return true;
  }
  return false;
}

function roleFromKind(kind: number | undefined): Role {
  if (kind === PlaceholderKind.title) {
    return "title";
  }
  if (kind === PlaceholderKind.body) {
    return "body";
  }
  return undefined;
}

/** The drawable ids a slide's `sageTagToInfoMap` assigns to title/body roles. */
interface SageRoles {
  /** The chosen title drawable (a `Title` tag, else a `Subheading` tag). */
  titleId?: bigint;
  /** Drawables tagged as body content (`Bullets`/`Body`), in map order. */
  bodyIds: bigint[];
  /**
   * Every title-candidate or body drawable id, even the title candidate not
   * chosen — all are excluded from the positioned free text boxes.
   */
  handledIds: bigint[];
}

/**
 * Resolves a slide's `sageTagToInfoMap` to title/body drawable ids. Title and
 * body tagged boxes are pulled out of the positioned text-box flow (their ids go
 * in `handledIds`); other tags (Stat*, Speaker, Media, labels, …) are left to
 * surface as ordinary positioned text boxes.
 */
function collectSageTags(slide: SlideArchive): SageRoles {
  const map = slide.sageTagToInfoMap;
  const roles: SageRoles = { bodyIds: [], handledIds: [] };
  if (!map?.length) {
    return roles;
  }

  const idForTag = (tag: string): bigint | undefined =>
    map.find((mapEntry) => mapEntry.tag === tag)?.info?.identifier;

  for (const tag of SAGE_TITLE_TAGS) {
    const id = idForTag(tag);
    if (id === undefined) {
      continue;
    }
    roles.handledIds.push(id);
    roles.titleId ??= id;
  }

  for (const mapEntry of map) {
    const id = mapEntry.info?.identifier;
    if (id !== undefined && SAGE_BODY_TAGS.has(mapEntry.tag)) {
      roles.bodyIds.push(id);
      roles.handledIds.push(id);
    }
  }

  return roles;
}

/** Text of a drawable referenced by id, whether a shape or a title placeholder. */
function drawableParagraphs(id: bigint, registry: Registry): Paragraph[] {
  const entry = registry.get(id);
  if (!entry) {
    return [];
  }

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
  if (sageTitle && !defaults.has(sageTitle)) {
    return sageTitle;
  }

  for (const paragraphs of collected.titles) {
    const text = joinText(paragraphs);
    if (text && !defaults.has(text)) {
      return text;
    }
  }

  const thumbnail = (slide.thumbnailTextForTitlePlaceholder ?? "").trim();
  if (thumbnail && !defaults.has(thumbnail)) {
    return thumbnail;
  }

  return undefined;
}

function pickBody(bodies: Paragraph[][], defaults: Set<string>): Paragraph[] {
  for (const paragraphs of bodies) {
    const text = joinText(paragraphs);
    if (text && !defaults.has(text)) {
      return paragraphs;
    }
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
  if (!note) {
    return [];
  }
  return extractParagraphs(registry.resolve<StorageArchive>(note.containedStorage), registry);
}
