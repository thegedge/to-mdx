import type { Paragraph, Slide, SlideImage, SlideVideo, SvgPath, TableData, TextBox } from "../model.ts";
import type { Registry } from "../registry.ts";
import { isType } from "../type_ids.ts";
import { PlaceholderKind } from "../types.ts";
import type {
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
import { svgPath } from "./shapes.ts";
import { asTextBox } from "./code.ts";
import { contentBoxPercent, drawableGeometry, type RawBox, slideLayoutClass } from "./layout.ts";
import { boxPercent, colorToHex, textBoxStyle } from "./style.ts";
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
): Slide {
  const collected = collectFromSlide(slide, registry, layout.slideSize);
  const title = pickTitle(slide, collected, defaults.titles);
  const backgroundColor = slideBackgroundColor(slide, registry);

  return {
    className: layout.useHeuristics ? classifyLayout(slide, registry, collected, layout.slideSize, title) : undefined,
    ...(backgroundColor ? { backgroundColor } : {}),
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
interface SlideStyleNode {
  slideProperties?: SlideStylePropertiesArchive;
  super?: SlideStyleNode;
}

/**
 * The slide's solid background fill color (`#RRGGBB`), resolved from its style by
 * walking the `super` chain to the first `slideProperties.fill` that carries a
 * solid color. Gradient/image fills are ignored (solid color only); absent when
 * no style or solid fill resolves.
 */
function slideBackgroundColor(slide: SlideArchive, registry: Registry): string | undefined {
  // `super` is typed as a bare `TSS.StyleArchive` but is slide-style-shaped at
  // runtime, so we reinterpret the resolved style as a `SlideStyleNode`.
  let node: SlideStyleNode | undefined = registry.resolve<SlideStyleArchive>(slide.style) as unknown as
    | SlideStyleNode
    | undefined;
  while (node) {
    const color = node.slideProperties?.fill?.color;
    if (color && (color.r !== undefined || color.g !== undefined || color.b !== undefined)) {
      return colorToHex(color);
    }
    node = node.super;
  }
  return undefined;
}

/** The slide's master ("template") name, used to map to a layout class. */
function masterName(slide: SlideArchive, registry: Registry): string | undefined {
  const ref = slide.templateSlide;
  if (!ref) return undefined;
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
    if (collected.sageTitle.length > 0) pushGeometry(registry.get(sage.titleId)?.message, collected);
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
    const table = extractTable(entry.message as TableInfoArchive, registry);
    if (table) collected.tables.push(table);
    else collected.tableCount += 1;
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
    const paragraphs = extractParagraphs(storage, registry);
    collectText(resolvedRole, paragraphs, placeholder, storage, registry, collected);
    if (paragraphs.length > 0) pushGeometry(placeholder, collected);
    return;
  }

  if (isType(entry.type, "ShapeInfoArchive")) {
    const shape = entry.message as ShapeInfoArchive;
    const storage = storageForShape(shape, registry);
    const paragraphs = extractParagraphs(storage, registry);
    if (paragraphs.length === 0) {
      collectShape(shape, registry, collected);
      return;
    }
    collectText(role, paragraphs, shape, storage, registry, collected);
    pushGeometry(shape, collected);
  }
}

/** Collects a no-text shape's vector path (a line/arrow/icon); any shape with a drawable path renders. */
function collectShape(shape: ShapeInfoArchive, registry: Registry, collected: Collected): void {
  const style = registry.resolve<ShapeStyleArchive>(shape.super?.style);
  const path = svgPath(shape, style);
  if (path) collected.shapes.push(path);
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
): void {
  if (bucketParagraphs(role, paragraphs, collected) || paragraphs.length === 0) return;
  collected.textBoxes.push(freeTextBox(paragraphs, message, storage, registry, collected.slideSize));
}

/** Builds a free text box, attaching geometry/style only to prose (not code) boxes. */
function freeTextBox(
  paragraphs: Paragraph[],
  message: unknown,
  storage: StorageArchive | undefined,
  registry: Registry,
  slideSize: { width: number; height: number },
): TextBox {
  const textBox = asTextBox(paragraphs);
  if (textBox.kind !== "text") return textBox;

  const box = boxPercent(drawableGeometry(message), slideSize);
  const style = textBoxStyle(storage, registry);
  return { ...textBox, ...(box ? { box } : {}), ...(style ? { style } : {}) };
}

/** Records a drawable's geometry (walked through its `super` chain) for layout heuristics. */
function pushGeometry(message: unknown, collected: Collected): void {
  const box = drawableGeometry(message);
  if (box) collected.geometries.push(box);
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
  if (kind === PlaceholderKind.title) return "title";
  if (kind === PlaceholderKind.body) return "body";
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
  if (!map?.length) return roles;

  const idForTag = (tag: string): bigint | undefined =>
    map.find((mapEntry) => mapEntry.tag === tag)?.info?.identifier;

  for (const tag of SAGE_TITLE_TAGS) {
    const id = idForTag(tag);
    if (id === undefined) continue;
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
