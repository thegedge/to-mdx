import { kebabCase } from "../../utils.ts";
import { isFullBleed } from "./extract/layout.ts";
import { rgba } from "./extract/style.ts";
import { declarationBody, hoistStyles, StyleCollector } from "./hoist.ts";
import type { Declaration } from "./hoist.ts";
import type { ImageCrop, Paragraph, Presentation, Slide, SlideImage, SlideVideo, SvgPath, TableCell, TableData, TextBox, TextBoxGeometry } from "./model.ts";

const INDENT = "  ";

/** Fallback slide size (16:9 at 1080p) when a deck declares none, for the SVG viewBox. */
const DEFAULT_SLIDE_SIZE = { width: 1920, height: 1080 };

/**
 * A JSX attribute that resolves a file against the exported `imageRoot` const,
 * e.g. `src={`${imageRoot}/pic.png`}`. Built by string concatenation so the
 * literal backticks and `${…}` survive into the MDX output.
 */
function rootedAttr(name: string, fileName: string): string {
  return name + "={`${imageRoot}/" + fileName + "`}";
}

function imageSrc(fileName: string): string {
  return rootedAttr("src", fileName);
}

/** Extensions that are images even when carried as a Keynote "movie" (e.g. an animated GIF). */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "gif", "png", "jpg", "jpeg", "webp", "avif", "apng", "heic", "heif", "svg", "bmp", "tiff",
]);

/**
 * True when `name`'s lowercased extension is a known image type. Used to redirect
 * "videos" that are really animated images (a `<video>` tag can't render them) to
 * an `<Image>` instead. A name with no extension is not an image.
 */
export function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * The collector active for the current `presentationToMdx` render, into which
 * `styleAttr` registers each style's structured declarations (emitting a
 * placeholder token in their place) so `hoistStyles` can work on the declarations
 * rather than a regex parse of the rendered JSX. Undefined outside a render and
 * while emitting the document `<defs>` (whose styles are never hoisted), where
 * `styleAttr` falls back to emitting a literal `style={{ … }}`.
 */
let activeCollector: StyleCollector | undefined;

/**
 * Turns ordered style declarations into a JSX `style={{ … }}` attribute string,
 * e.g. `style={{ position: "absolute", left: "10%", fontWeight: 700 }}`. Returns
 * an empty string when there is nothing to emit. During a render the style is
 * registered with the {@link activeCollector} and a placeholder token is returned
 * in place of the attribute, so the hoister can read it back structurally.
 */
export function styleAttr(declarations: Declaration[]): string {
  if (declarations.length === 0) {
    return "";
  }
  if (activeCollector) {
    return activeCollector.add(declarations);
  }
  return `style={{ ${declarationBody(declarations)} }}`;
}

/**
 * Makes plain text safe as MDX flow content. The angle brackets `<`/`>` (parsed
 * as JSX tags) and braces `{`/`}` (parsed as JS expressions) are significant;
 * everything else is literal. Do not use on code spans/fences (already literal).
 */
export function escapeMdxText(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

/**
 * Joins the metadata exports and the rendered MDX body with a blank line between
 * them, and a trailing newline. Kept separate so the blank line is asserted in
 * isolation (a template literal here would invite `dedent` to collapse it).
 */
export function assembleMdxDocument(metadataExports: string, content: string): string {
  return `${metadataExports}\n\n${content}\n`;
}

export function presentationToMdx(presentation: Presentation): string {
  const slideSize = presentation.slideSize ?? DEFAULT_SLIDE_SIZE;
  // Document-wide dedupe: every shape's LOCAL path is stored once in a leading
  // `<defs>` and referenced by `<use>`, so repeated shapes (cars, arrows, every
  // straight connector) collapse to one definition keyed on the local `d`.
  const pathIds = collectPathIds(presentation);

  // Render the slides with a render-scoped collector active, so every `styleAttr`
  // registers its structured declarations and leaves a placeholder token behind.
  // Restored afterwards so the document `<defs>` styling stays literal (unhoisted).
  const collector = new StyleCollector();
  const previousCollector = activeCollector;
  activeCollector = collector;
  let slides: string;
  try {
    slides = presentation.slides.map((slide) => renderSlide(slide, slideSize, pathIds)).join("\n\n");
  } finally {
    activeCollector = previousCollector;
  }

  // `backgroundRoot={imageRoot}` references the exported `imageRoot` const (a JSX
  // expression), not a string literal.
  const className = kebabCase(presentation.title);
  const scope = `.slides.${className}`;

  const rawWrapper = `<Slides className="${className}" backgroundRoot={imageRoot}>\n${slides}\n</Slides>`;
  // Lift repeated colors/fonts/style-sets into the scoped stylesheet, leaving the
  // rendered slides visually identical (see `hoistStyles`).
  const { wrapper, rules } = hoistStyles(rawWrapper, scope, collector);

  // The scoped stylesheet merges the hoisted rules with the shared table rules.
  // HTML `<table>`s depend on the latter; spanless markdown tables get default
  // styling but it is harmless.
  const styleRules = [...rules];
  if (hasRenderableTable(presentation)) {
    styleRules.push(...tableStyleRules(scope));
  }

  // Document-level heads emitted before `<Slides>` (their selectors/ids still
  // match document-wide): the shared shape `<defs>`, then the scoped stylesheet.
  const heads: string[] = [];
  const defs = shapeDefsBlock(presentation, pathIds);
  if (defs) {
    heads.push(defs);
  }
  if (styleRules.length > 0) {
    heads.push("<style>{`\n" + styleRules.join("\n") + "\n`}</style>");
  }
  return [...heads, wrapper].join("\n\n");
}

/**
 * The document-wide map from a shape's local `d` string to its shared `<defs>` id
 * (`kn-p1`, `kn-p2`, …), assigned in first-seen order across all slides. Keyed on
 * the local `d` only — style/transform live on each `<use>`, so two shapes that
 * differ only in colour or placement still share one definition.
 */
function collectPathIds(presentation: Presentation): Map<string, string> {
  const ids = new Map<string, string>();
  for (const slide of presentation.slides) {
    for (const shape of slide.shapes ?? []) {
      if (!ids.has(shape.localD)) {
        ids.set(shape.localD, `kn-p${ids.size + 1}`);
      }
    }
  }
  return ids;
}

/**
 * The single hidden, document-level `<svg>` holding each unique local shape path
 * once (`<path id="kn-pN" d=…>`) plus the shared arrowhead marker, all referenced
 * by the per-shape `<use>` elements. Width/height 0 and absolute positioning keep
 * it out of layout. Returns "" when the deck carries no shapes; the marker is
 * included only when some shape uses an arrowhead.
 */
function shapeDefsBlock(presentation: Presentation, pathIds: Map<string, string>): string {
  const brush = anyBrushBorder(presentation);
  // Brush-border boxes need the shared `<filter>` even on a deck with no shapes,
  // so the defs `<svg>` is still emitted when only brush borders are present.
  if (pathIds.size === 0 && !brush) {
    return "";
  }
  const entries: string[] = [];
  if (brush) {
    entries.push(ROUGH_FILTER);
  }
  if (anyShapeMarker(presentation)) {
    entries.push(ARROW_MARKER);
  }
  for (const [d, id] of pathIds) {
    entries.push(defElement(id, d));
  }
  const body = entries.map((entry) => `${INDENT.repeat(2)}${entry}`).join("\n");
  return `<svg width="0" height="0" aria-hidden="true" ${styleAttr([["position", "absolute"]])}>\n${INDENT}<defs>\n${body}\n${INDENT}</defs>\n</svg>`;
}

/**
 * A shape def as the simplest SVG element for its geometry: a two-point `M…L…`
 * is a `<line>`, an all-`M`/`L` path is a `<polyline>`, anything with curves or a
 * close is a `<path>`. (The `<use>` carries fill/stroke, so an open polyline still
 * strokes like the original path.)
 */
function defElement(id: string, d: string): string {
  const points = linearPoints(d);
  if (points && points.length === 2) {
    const [[x1, y1], [x2, y2]] = points;
    return `<line id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }
  if (points && points.length > 2) {
    return `<polyline id="${id}" points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" />`;
  }
  return `<path id="${id}" d="${d}" />`;
}

/** The points of a path made only of `M`/`L` commands, or null if it has curves/closes. */
function linearPoints(d: string): Array<[number, number]> | null {
  const tokens = d.trim().split(/\s+/);
  const points: Array<[number, number]> = [];

  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i] !== "M" && tokens[i] !== "L") {
      return null;
    }
    const x = Number(tokens[i + 1]);
    const y = Number(tokens[i + 2]);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return null;
    }
    points.push([x, y]);
  }

  return points.length >= 2 ? points : null;
}

/** Whether any shape in the deck resolves an arrowhead (so the shared marker is worth emitting). */
function anyShapeMarker(presentation: Presentation): boolean {
  return presentation.slides.some((slide) => (slide.shapes ?? []).some((shape) => shape.markerStart || shape.markerEnd));
}

/** Whether any text box in the deck carries a smart-brush border (so the shared rough filter is emitted). */
function anyBrushBorder(presentation: Presentation): boolean {
  return presentation.slides.some((slide) =>
    slide.textBoxes.some((box) => box.kind === "text" && box.style?.brushBorder !== undefined),
  );
}

/**
 * The shared "rough" displacement filter, emitted once in the document `<defs>`
 * when any box uses a smart-brush border. `feTurbulence` makes fractal noise that
 * `feDisplacementMap` uses to wobble the rect's straight edges into a hand-drawn
 * line; the filter region is widened (`-20%`…`140%`) so displaced edges aren't
 * clipped.
 */
const ROUGH_FILTER =
  '<filter id="kn-rough" x="-20%" y="-20%" width="140%" height="140%">' +
  '<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="0" result="noise" />' +
  '<feDisplacementMap in="SourceGraphic" in2="noise" scale="10" /></filter>';

/**
 * The base added to a drawable's back-to-front `zOrder` rank to form its stacking
 * rank. ≥ 1 so every positioned drawable ranks above the rank-0 slide backdrop
 * (cover background image, tint overlay, full-bleed cover video).
 */
const POSITION_Z_BASE = 1;

/**
 * A positioned drawable's stacking rank from its `drawablesZOrder` rank (higher =
 * nearer the front). Falls back to the type-based default when the slide declares
 * no z-order (older decks), preserving the prior fixed layering. The rank is used
 * only to sort drawables into document order — later siblings paint on top — so no
 * explicit `zIndex` style is emitted.
 */
function positionedZIndex(zOrder: number | undefined, fallback: number): number {
  return zOrder === undefined ? fallback : POSITION_Z_BASE + zOrder;
}

/** Absolute-positioning declarations for a placed image (stacking comes from document order). */
function imageDeclarations(box: TextBoxGeometry): Declaration[] {
  return [["position", "absolute"], ...positionRules(box)];
}

/**
 * Edge-to-edge `cover` declarations for a full-bleed video. Emitted first in
 * document order (rank 0) so the slide's later content overlays it as attribution.
 */
function videoCoverDeclarations(): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", 0],
    ["top", 0],
    ["width", "100%"],
    ["height", "100%"],
    ["objectFit", "cover"],
  ];
}

/**
 * Renders a placed movie. A full-bleed video becomes an edge-to-edge `cover`
 * layer behind the slide's content; a video carrying a smaller box is positioned
 * absolutely (below text, like an image); a video with no geometry stays a plain
 * `<video controls>`. A "movie" that is really an animated image (gif/apng/…)
 * can't play in a `<video>`, so it renders as an `<Image>` under the same rules.
 */
function renderVideo(video: SlideVideo): string {
  const declarations = video.box
    ? isFullBleed(video.box)
      ? videoCoverDeclarations()
      : imageDeclarations(video.box)
    : [];
  const attr = declarations.length > 0 ? styleAttr(declarations) : "";

  if (isImageFile(video.fileName)) {
    return `<Image ${attr ? `${attr} ` : ""}${imageSrc(video.fileName)} role="presentation" alt="" />`;
  }
  return attr
    ? `<video controls ${attr} ${imageSrc(video.fileName)} />`
    : `<video controls ${imageSrc(video.fileName)}></video>`;
}

/** A box dimension at or below this percentage is treated as "auto" (Keynote reports 0). */
const SIZE_EPSILON = 0.5;

/**
 * For auto-sized boxes, the start position past which we anchor by the far edge
 * (`right`/`bottom`) instead of the near edge. Only boxes genuinely hugging the
 * far edge flip; boxes in the bulk of the slide stay near-anchored at their true
 * position, so evenly-placed labels (e.g. a vertical column of emoji) render
 * evenly spaced rather than mixing top- and bottom-anchoring.
 */
const FAR_EDGE_ANCHOR = 85;

/**
 * The placement declarations for a box, one axis at a time. Auto-sizing Keynote
 * text boxes report a zero width/height, which would collapse the element and
 * push it off-screen; for those we omit the size and anchor by the near edge
 * (`left`/`top` when the box starts in the first half, otherwise `right`/`bottom`
 * measured from the far edge). When the size is real we keep the start + size as
 * before. Pure and data-driven so absent props are simply not emitted.
 */
export function positionRules(box: TextBoxGeometry): Declaration[] {
  return [
    ...axisRules("left", "right", "width", box.left, box.width),
    ...axisRules("top", "bottom", "height", box.top, box.height),
  ];
}

function axisRules(near: string, far: string, sizeProp: string, start: number, size: number): Declaration[] {
  if (size <= SIZE_EPSILON) {
    // Anchor by the box's true top/left so evenly-placed boxes stay evenly spaced;
    // only a box hugging the far edge flips to the far edge to stay on-screen.
    return start <= FAR_EDGE_ANCHOR ? [[near, `${percent(start)}%`]] : [[far, `${percent(100 - start)}%`]];
  }
  return [
    [near, `${percent(start)}%`],
    [sizeProp, `${percent(size)}%`],
  ];
}

/**
 * The inline-style declarations for one free text box, in source order, skipping
 * absent properties. `omitFontSize` drops the box-level `fontSize` when the box's
 * paragraphs are sized individually (see `renderProse`), so the single shared
 * size doesn't fight the per-paragraph ones.
 */
function boxDeclarations(textBox: Extract<TextBox, { kind: "text" }>, omitFontSize = false): Declaration[] {
  const declarations: Declaration[] = [];

  if (textBox.box) {
    declarations.push(["position", "absolute"]);
    declarations.push(...positionRules(textBox.box));
  }

  const style = textBox.style;
  if (style?.fontFamily) {
    declarations.push(["fontFamily", style.fontFamily]);
  }
  if (style?.fontSizeToken && !omitFontSize) {
    declarations.push(["fontSize", style.fontSizeToken]);
  }
  if (style?.color) {
    declarations.push(["color", style.color]);
  }
  if (style?.fontWeight !== undefined) {
    declarations.push(["fontWeight", style.fontWeight]);
  }
  // A filled box is one of the deck's sized diagram labels (e.g. "verifier",
  // "maps"): center its text both ways via flexbox, since the box has a real
  // height to center within. Flow/placeholder boxes carry no fill, so they keep
  // their natural top-left flow. Centering forces `textAlign: center`, overriding
  // any per-paragraph alignment; an unfilled box keeps its own alignment.
  const centered = !!style?.backgroundColor;
  if (centered) {
    declarations.push(["display", "flex"]);
    declarations.push(["flexDirection", "column"]);
    declarations.push(["justifyContent", "center"]);
    declarations.push(["alignItems", "center"]);
    declarations.push(["textAlign", "center"]);
    // An auto-sized (0-dimension) filled label is anchored on its CENTER in
    // Keynote, but with no width/height to emit it would render top/left-anchored
    // (the label's edge landing on the anchor). Shift it back onto the point per
    // collapsed axis (e.g. the "retransmission timer" box onto its sender line).
    const box = textBox.box;
    if (box) {
      const shiftX = box.width <= SIZE_EPSILON;
      const shiftY = box.height <= SIZE_EPSILON;
      if (shiftX || shiftY) {
        declarations.push(["transform", `translate(${shiftX ? "-50%" : "0"}, ${shiftY ? "-50%" : "0"})`]);
      }
    }
  } else if (style?.textAlign) {
    declarations.push(["textAlign", style.textAlign]);
  }
  // A character outline (white-on-black "REQUEST" style text); camelCase JSX key.
  if (style?.textStroke) {
    declarations.push(["WebkitTextStroke", style.textStroke]);
  }
  // A drop shadow lifted from the backing shape (e.g. the sign-off "Thanks!").
  if (style?.textShadow) {
    declarations.push(["textShadow", style.textShadow]);
  }
  // The backing shape's group-level Style-tab opacity (e.g. a translucent label).
  if (style?.opacity !== undefined) {
    declarations.push(["opacity", style.opacity]);
  }
  // A shape-fill background, with a little breathing room so text isn't flush to
  // the box edge (matching the deck's filled diagram labels).
  if (style?.backgroundColor) {
    declarations.push(["backgroundColor", style.backgroundColor]);
    declarations.push(["padding", "0.2em 0.4em"]);
  }
  // The backing shape's stroke as a CSS border (e.g. the "retransmission timer" box).
  if (style?.border) {
    declarations.push(["border", style.border]);
  }
  // A rounded-rect shape's corner radius (e.g. the diagram labels' "8.9%").
  if (style?.borderRadius) {
    declarations.push(["borderRadius", style.borderRadius]);
  }

  return declarations;
}

/** Rounds a percentage to a single decimal, dropping a trailing zero (e.g. 10, 33.3). */
function percent(value: number): number {
  return Number(value.toFixed(1));
}

function renderSlide(slide: Slide, slideSize: { width: number; height: number }, pathIds: Map<string, string>): string {
  const attributes = slideAttributes(slide);
  const blocks = slideBlocks(slide, slideSize, pathIds);
  if (blocks.length === 0) {
    return attributes ? `<Slide ${attributes} />` : "<Slide />";
  }

  const open = attributes ? `<Slide ${attributes}>` : "<Slide>";
  return `${open}\n${indent(blocks.join("\n\n"))}\n</Slide>`;
}

/**
 * The `<Slide>` tag's attributes: the (inferred) layout class, plus a promoted
 * full-bleed `background` rendered `cover` (`opaqueBackground`, no contain). The
 * background attributes are emitted whenever one was promoted, independent of the
 * heuristics gate that governs the class.
 */
function slideAttributes(slide: Slide): string {
  const parts: string[] = [];
  if (slide.className) {
    parts.push(`className="${slide.className}"`);
  }
  if (slide.background) {
    // The `Slide` component prepends `backgroundRoot` (= imageRoot), so this is a
    // bare file name; rooting it here would double the prefix and 404 the image.
    parts.push(`background="${slide.background}"`);
    parts.push("opaqueBackground");
  }
  // The slide's solid background fill sits behind everything via an inline style,
  // so it shows wherever a background image doesn't fully cover the slide.
  if (slide.backgroundColor) {
    parts.push(styleAttr([["backgroundColor", slide.backgroundColor]]));
  }
  return parts.join(" ");
}

/** A positioned drawable's rendered HTML paired with its stacking rank (the sort key). */
interface PositionedBlock {
  z: number;
  html: string;
}

function slideBlocks(slide: Slide, slideSize: { width: number; height: number }, pathIds: Map<string, string>): string[] {
  // The static markdown base layer: title and body bullets, plus any drawable that
  // carries no absolute position (flow images/videos/text/markdown tables). The
  // positioned drawables always paint above this base, so its relative order is
  // unaffected by their stacking.
  const base: string[] = [];
  // Positioned drawables paired with their stacking rank. Pushed in this type order
  // (tint, shape runs, text boxes, images, videos, tables) so a stable sort keeps
  // today's paint sequence among equal ranks.
  const positioned: PositionedBlock[] = [];

  // A full-bleed tint over the background image (rank 0): above the cover
  // background, below the figure (rank 1) and text (rank >= 2).
  if (slide.backgroundTint) {
    positioned.push({ z: 0, html: backgroundTintOverlay(slide.backgroundTint) });
  }

  if (slide.title) {
    base.push(`# ${escapeMdxText(slide.title)}`);
  }
  if (slide.body.length > 0) {
    base.push(renderBullets(slide.body));
  }

  // Shapes are grouped into one `<svg>` per contiguous z-order run, so a slide of
  // identical icons collapses to a single overlay instead of dozens.
  for (const run of groupShapeRuns(slide.shapes ?? [], shapeBarriers(slide))) {
    positioned.push({ z: run.z, html: renderShapeRun(run, slideSize, pathIds) });
  }

  for (const textBox of slide.textBoxes) {
    const html = renderTextBox(textBox);
    if (textBox.kind === "text" && textBox.box) {
      // Falls back to rank 2 (above positioned images) for decks with no z-order.
      positioned.push({ z: positionedZIndex(textBox.zOrder, 2), html });
    } else {
      base.push(html);
    }
  }

  for (const image of slide.images) {
    const html = renderImage(image);
    if (image.box || image.crop) {
      // A backdrop master sits behind all content at rank 0.
      positioned.push({ z: image.backdrop ? 0 : positionedZIndex(image.zOrder, 1), html });
    } else {
      base.push(html);
    }
  }

  for (const video of slide.videos) {
    const html = renderVideo(video);
    if (video.box) {
      // A full-bleed cover video stays at the backdrop rank (0) regardless of zOrder.
      positioned.push({ z: isFullBleed(video.box) ? 0 : positionedZIndex(video.zOrder, 1), html });
    } else {
      base.push(html);
    }
  }

  for (const table of slide.tables) {
    const html = renderPositionedTable(table);
    if (table.box && html) {
      positioned.push({ z: 1, html });
    } else {
      base.push(html);
    }
  }

  // Stable-sort by ascending rank so document order encodes stacking: a later
  // sibling paints on top, reproducing the old explicit `zIndex` without it.
  positioned.sort((a, b) => a.z - b.z);

  const blocks = [...base, ...positioned.map((block) => block.html)];

  if (slide.tableCount > 0) {
    blocks.push(`{/* ${slide.tableCount} table(s) on this slide could not be extracted */}`);
  }

  const notes = renderSpeakerNotes(slide.notes);
  if (notes) {
    blocks.push(notes);
  }

  return blocks.filter((block) => block.length > 0);
}

/**
 * A full-bleed `<div>` tint overlay laid over the slide's background image at the
 * backdrop layer (rank 0, emitted first) — above the `cover` background image,
 * below the figures and text. The tint is a CSS color (`#rrggbb` or `rgba(...)`).
 */
function backgroundTintOverlay(tint: string): string {
  return `<div ${styleAttr(tintOverlayDeclarations(tint))} />`;
}

function tintOverlayDeclarations(tint: string): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", 0],
    ["top", 0],
    ["width", "100%"],
    ["height", "100%"],
    ["backgroundColor", tint],
  ];
}

/** The inline style placing one shape's edge-to-edge `<svg>` (stacking comes from document order). */
function shapeOverlayDeclarations(): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", 0],
    ["top", 0],
    ["width", "100%"],
    ["height", "100%"],
    ["overflow", "visible"],
    ["pointerEvents", "none"],
  ];
}

/**
 * The shared arrowhead marker, emitted once in the document-level `<defs>` when
 * any shape uses an arrow. `markerUnits="userSpaceOnUse"` fixes the arrowhead at a
 * constant slide-point size (12×12) regardless of the line's stroke width, so a
 * thick (stroke-width 8) connector no longer renders a giant ~48px head; the
 * default `strokeWidth` units would scale the marker with the line. The `viewBox`
 * keeps the triangle's own 0–10 coordinate space, so `refX`/`refY` are unchanged.
 */
const ARROW_MARKER =
  '<marker id="kn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" ' +
  'markerWidth="12" markerHeight="12" orient="auto-start-reverse">' +
  '<path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>';

/** One contiguous z-order run of shapes sharing a single overlay `<svg>`. */
interface ShapeRun {
  /** The run's stacking rank (its first/lowest shape rank), used as the sort key. */
  z: number;
  shapes: SvgPath[];
}

/**
 * The z-order ranks of a slide's NON-shape drawables (positioned text boxes,
 * images, videos). A shape run breaks wherever one of these ranks falls between
 * two shapes, so a label box between connector lines and icons splits them into
 * separate stacking layers — preserving today's z-order behaviour.
 */
function shapeBarriers(slide: Slide): number[] {
  const barriers: number[] = [];
  for (const textBox of slide.textBoxes) {
    if (textBox.kind === "text" && textBox.zOrder !== undefined) {
      barriers.push(textBox.zOrder);
    }
  }
  for (const image of slide.images) {
    if (image.zOrder !== undefined) {
      barriers.push(image.zOrder);
    }
  }
  for (const video of slide.videos) {
    if (video.zOrder !== undefined) {
      barriers.push(video.zOrder);
    }
  }
  return barriers;
}

/**
 * Groups a slide's shapes (already in back-to-front z-order) into maximal runs of
 * consecutive shapes with no other drawable's z-rank between them. Each run shares
 * one overlay `<svg>` stacked at the run's first (lowest) rank — so a slide of 47
 * identical cars collapses to a single overlay, while a label between two shapes
 * splits them into two overlays at different z. Shapes with no rank (older decks
 * with no `drawablesZOrder`) carry no barriers either, so they form one run.
 */
function groupShapeRuns(shapes: SvgPath[], barriers: number[]): ShapeRun[] {
  const runs: ShapeRun[] = [];
  let current: SvgPath[] = [];
  let previousZ: number | undefined;
  for (const shape of shapes) {
    if (current.length > 0 && splitsRun(previousZ, shape.zOrder, barriers)) {
      runs.push(makeRun(current));
      current = [];
    }
    current.push(shape);
    previousZ = shape.zOrder;
  }
  if (current.length > 0) {
    runs.push(makeRun(current));
  }
  return runs;
}

/** True when a non-shape drawable's z-rank lies strictly between two consecutive shapes' ranks. */
function splitsRun(previousZ: number | undefined, z: number | undefined, barriers: number[]): boolean {
  if (previousZ === undefined || z === undefined) {
    return false;
  }
  const lo = Math.min(previousZ, z);
  const hi = Math.max(previousZ, z);
  return barriers.some((barrier) => barrier > lo && barrier < hi);
}

function makeRun(shapes: SvgPath[]): ShapeRun {
  return { z: positionedZIndex(shapes[0].zOrder, 1), shapes };
}

/**
 * One contiguous z-run of shapes as a single absolutely-positioned, full-slide
 * `<svg>` (its `viewBox` matching the slide so each `<use>` transform lands in
 * slide-point space); the overlay's document position carries the run's stacking.
 * Every shape is a `<use>` of its shared `<defs>` path, in z-order so later shapes
 * paint on top.
 */
function renderShapeRun(run: ShapeRun, slideSize: { width: number; height: number }, pathIds: Map<string, string>): string {
  const open = `<svg viewBox="0 0 ${percent(slideSize.width)} ${percent(slideSize.height)}" ${styleAttr(shapeOverlayDeclarations())}>`;
  const uses = run.shapes.map((shape) => `${INDENT}${renderUse(shape, pathIds)}`).join("\n");
  return `${open}\n${uses}\n</svg>`;
}

/**
 * A `<use>` referencing a shape's shared `<defs>` path, carrying its per-instance
 * `transform` (position/rotation/scale) and presentation style (fill/stroke/dash/
 * caps/opacities/arrowheads) — all of which apply to the referenced path.
 */
function renderUse(shape: SvgPath, pathIds: Map<string, string>): string {
  const id = pathIds.get(shape.localD) ?? "";
  const transform = shape.transform ? ` transform="${shape.transform}"` : "";

  // Paint via CSS `style`, not SVG presentation attributes: `var()` (from color
  // hoisting) resolves in CSS property values but not in a raw `fill="…"` attribute.
  const declarations: Declaration[] = [["fill", shape.fill ?? "none"], ["stroke", shape.stroke], ["strokeWidth", shape.strokeWidth]];
  if (shape.strokeDasharray) {
    declarations.push(["strokeDasharray", shape.strokeDasharray]);
  }
  if (shape.strokeLinecap) {
    declarations.push(["strokeLinecap", shape.strokeLinecap]);
  }
  if (shape.opacity !== undefined) {
    declarations.push(["opacity", shape.opacity]);
  }
  if (shape.fillOpacity !== undefined) {
    declarations.push(["fillOpacity", shape.fillOpacity]);
  }
  if (shape.strokeOpacity !== undefined) {
    declarations.push(["strokeOpacity", shape.strokeOpacity]);
  }

  const markers =
    (shape.markerStart ? ' markerStart="url(#kn-arrow)"' : "") + (shape.markerEnd ? ' markerEnd="url(#kn-arrow)"' : "");
  return `<use href="#${id}"${transform} ${styleAttr(declarations)}${markers} />`;
}

/**
 * An `<Image>` block. A masked image becomes a clipping wrapper showing only the
 * mask's sub-rectangle; otherwise images carrying geometry get an inline `style`
 * placing them absolutely (layered below text), and un-positioned images stay in
 * normal flow.
 */
function renderImage(image: SlideImage): string {
  // Stacking (backdrop behind all content, otherwise by z-order rank) comes from the
  // block's document position, set by `slideBlocks`; nothing here emits a zIndex.
  if (image.crop) {
    return renderCroppedImage(image.fileName, image.altText, image.crop, image.opacity);
  }
  const declarations = image.box ? imageDeclarations(image.box) : [];
  if (image.opacity !== undefined) {
    declarations.push(["opacity", image.opacity]);
  }
  const style = declarations.length > 0 ? `${styleAttr(declarations)} ` : "";
  return `<Image ${style}${imageSrc(image.fileName)} role="presentation" alt="${escapeMdxText(image.altText)}" />`;
}

/** The container-rectangle declarations for a masked image's clipping wrapper. */
function cropContainerDeclarations(crop: ImageCrop): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", `${percent(crop.left)}%`],
    ["top", `${percent(crop.top)}%`],
    ["width", `${percent(crop.width)}%`],
    ["height", `${percent(crop.height)}%`],
    ["overflow", "hidden"],
  ];
}

/** The inner-`<img>` declarations placing the full image inside the clipping wrapper. */
function cropImageDeclarations(crop: ImageCrop): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", `${percent(crop.imgLeft)}%`],
    ["top", `${percent(crop.imgTop)}%`],
    ["width", `${percent(crop.imgWidth)}%`],
    ["height", `${percent(crop.imgHeight)}%`],
  ];
}

/**
 * A masked image: an `overflow:"hidden"` container placed on the slide, wrapping
 * the full `<Image>` offset/sized so only the mask's sub-rectangle shows.
 */
function renderCroppedImage(fileName: string, altText: string, crop: ImageCrop, opacity?: number): string {
  const container = styleAttr(cropContainerDeclarations(crop));
  const innerDeclarations = cropImageDeclarations(crop);
  if (opacity !== undefined) {
    innerDeclarations.push(["opacity", opacity]);
  }
  const inner = `<Image ${styleAttr(innerDeclarations)} ${imageSrc(fileName)} role="presentation" alt="${escapeMdxText(altText)}" />`;
  return `<div ${container}>\n${INDENT}${inner}\n</div>`;
}

function renderSpeakerNotes(notes: Paragraph[]): string {
  if (notes.length === 0) {
    return "";
  }
  return `<SpeakerNotes>\n${indent(renderBullets(notes))}\n</SpeakerNotes>`;
}

function renderBullets(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) => `${INDENT.repeat(Math.max(0, paragraph.depth))}- ${escapeMdxText(paragraph.text)}`)
    .join("\n");
}

function renderTextBox(textBox: TextBox): string {
  if (textBox.kind === "code") {
    return `\`\`\`${textBox.language}\n${textBox.text}\n\`\`\``;
  }
  const { content, perParagraphSizes } = renderProse(textBox.paragraphs, textBox.style?.fontSizeToken);
  // Positioned/styled boxes get an inline-style div; otherwise the prose stays in
  // normal flow with no wrapper (there is nothing to style). When the paragraphs
  // carry their own sizes, drop the box-level `fontSize` so it doesn't override them.
  const style = styleAttr(boxDeclarations(textBox, perParagraphSizes));
  // A smart-brush border draws as a rough-filtered SVG overlay filling the box
  // (the first child, behind the flow text); the box div is the containing block.
  const brush = textBox.style?.brushBorder;
  const body = brush ? `${brushBorderOverlay(brush)}\n${content}` : content;
  return style ? `<div ${style}>\n${body}\n</div>` : content;
}

/** Edge-to-edge declarations for a brush-border overlay `<svg>` filling its box (no pointer/paint impact). */
function brushBorderOverlayDeclarations(): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", 0],
    ["top", 0],
    ["right", 0],
    ["bottom", 0],
    ["width", "100%"],
    ["height", "100%"],
    ["overflow", "visible"],
    ["pointerEvents", "none"],
  ];
}

/**
 * A box's smart-brush border as an absolutely-positioned `<svg>` filling the box,
 * holding one `<rect>` outline distorted by the shared `#kn-rough` filter so it
 * reads as a hand-drawn line. `aria-hidden` since it is decorative.
 */
function brushBorderOverlay(brush: { color: string; width: number }): string {
  const svgStyle = styleAttr(brushBorderOverlayDeclarations());
  const rect =
    `<rect x="0" y="0" width="100%" height="100%" fill="none" ` +
    `stroke="${brush.color}" strokeWidth={${brush.width}} filter="url(#kn-rough)" />`;
  return `<svg aria-hidden="true" ${svgStyle}>${rect}</svg>`;
}

/**
 * Renders a text box's prose. When the box's paragraphs resolve to more than one
 * distinct font size (each line's own `fontSizeToken`, falling back to the
 * box-level size), every paragraph is wrapped in a `<p>` carrying its own
 * `fontSize` and `perParagraphSizes` is set so the caller drops the box-level
 * size. A uniform (or single-paragraph) box keeps today's blank-line-joined prose
 * and a single box-level size.
 */
function renderProse(
  paragraphs: Paragraph[],
  boxToken: string | undefined,
): { content: string; perParagraphSizes: boolean } {
  const tokens = paragraphs.map((paragraph) => paragraph.fontSizeToken ?? boxToken);
  const distinct = new Set(tokens.filter((token): token is string => token !== undefined));
  if (distinct.size <= 1) {
    return { content: paragraphs.map((paragraph) => escapeMdxText(paragraph.text)).join("\n\n"), perParagraphSizes: false };
  }
  const content = paragraphs
    .map((paragraph, index) => {
      const token = tokens[index];
      const attr = token ? ` ${styleAttr([["fontSize", token]])}` : "";
      return `<p${attr}>${escapeMdxText(paragraph.text)}</p>`;
    })
    .join("\n");
  return { content, perParagraphSizes: true };
}

/** Whether any slide carries a table with at least one cell (i.e. that renders). */
function hasRenderableTable(presentation: Presentation): boolean {
  return presentation.slides.some((slide) =>
    slide.tables.some((table) => table.rows.some((row) => row.length > 0)),
  );
}

/**
 * The scoped CSS rule blocks shared by every HTML table in the document, merged
 * into the document's single `<style>` before `<Slides>`. The selector is scoped
 * to the deck's slug (the same class on `<Slides>`) so the table styling cannot
 * leak, and styles the bare `table`/`th`/`td` elements directly (no per-table
 * class). Built by string concatenation so the CSS braces survive inside the JSX
 * expression container.
 */
function tableStyleRules(scope: string): string[] {
  return [
    `${scope} table {\n  border-collapse: collapse;\n}`,
    `${scope} th,\n${scope} td {\n  border: 1px solid currentColor;\n  padding: 0.25em;\n}`,
  ];
}

/** Renders a table, wrapped in an absolutely-positioned div at its slide box when it has one. */
function renderPositionedTable(table: TableData): string {
  const rendered = renderTable(table);
  if (!table.box || !rendered) {
    return rendered;
  }
  const declarations: Declaration[] = [["position", "absolute"], ...positionRules(table.box)];
  return `<div ${styleAttr(declarations)}>\n${indent(rendered)}\n</div>`;
}

/**
 * Renders an extracted table. A table whose cells never span (every cell is
 * 1×1) becomes a GitHub-flavored markdown table (the first row is the header);
 * GFM cannot express col/row spans, so any spanning cell forces the HTML
 * `<table>` form instead. A table with no cells renders nothing.
 */
export function renderTable(table: TableData): string {
  if (table.rows.every((row) => row.length === 0)) {
    return "";
  }
  // GFM cannot express col/row spans, cell backgrounds, or per-cell text
  // color/alignment, so any of those forces the raw-HTML form; only a span-free,
  // style-free table stays markdown.
  return isSpanless(table) && !hasCellStyle(table) ? renderMarkdownTable(table) : renderHtmlTable(table);
}

/** True when no cell in the table spans more than one column or row. */
function isSpanless(table: TableData): boolean {
  return table.rows.every((row) => row.every((cell) => cell.colSpan === 1 && cell.rowSpan === 1));
}

/**
 * True when any cell carries inline styling markdown cannot express: a background
 * fill, a text color, or a text alignment (any one forces the HTML form). With a
 * default `center` alignment on every extracted cell, this holds for every
 * non-empty extracted table.
 */
function hasCellStyle(table: TableData): boolean {
  return table.rows.some((row) =>
    row.some((cell) => cell.backgroundColor !== undefined || cell.color !== undefined || cell.align !== undefined),
  );
}

/**
 * Renders a spanless table as a GFM markdown table: the first non-empty row is
 * the header, followed by a `| --- |` separator and the body rows. Rows are
 * padded to the widest row so the pipe columns line up.
 */
function renderMarkdownTable(table: TableData): string {
  const rows = table.rows.filter((row) => row.length > 0);
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: TableCell[]): string => {
    const cells = row.map((cell) => markdownCell(cell.text));
    while (cells.length < width) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  const separator = `| ${Array(width).fill("---").join(" | ")} |`;
  const [header, ...body] = rows;
  return [line(header), separator, ...body.map(line)].join("\n");
}

/** Escapes a markdown cell: MDX-escaped, `|` escaped as `\|`, newlines as `<br>`. */
function markdownCell(text: string): string {
  return escapeMdxText(text).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/**
 * Renders a spanning table as raw HTML (`<table>`/`<tr>`/`<td>`), which MDX
 * passes through. Only anchor cells are emitted; merges become `colSpan`/`rowSpan`
 * attributes (omitted when 1). Cell text is MDX-escaped and intra-cell newlines
 * become `<br/>`. Borders come from the shared scoped `table` rule, so the
 * element carries no class and cells carry no inline style.
 */
function renderHtmlTable(table: TableData): string {
  const body = table.rows
    .map((row) => `${INDENT}<tr>${row.map(renderCell).join("")}</tr>`)
    .join("\n");
  return `<table>\n${body}\n</table>`;
}

/**
 * A single `<td>` with span attributes (omitted when 1), an optional inline style
 * (background fill, text color, font family, bold weight, and text alignment), and
 * escaped text. The style declarations are emitted in a stable order so output is
 * deterministic.
 */
function renderCell(cell: TableCell): string {
  let attrs = "";
  if (cell.colSpan > 1) {
    attrs += ` colSpan={${cell.colSpan}}`;
  }
  if (cell.rowSpan > 1) {
    attrs += ` rowSpan={${cell.rowSpan}}`;
  }
  const declarations: Declaration[] = [];
  const fill = cellFillStyle(cell);
  if (fill) {
    declarations.push(["backgroundColor", fill]);
  }
  if (cell.color !== undefined) {
    declarations.push(["color", cell.color]);
  }
  if (cell.fontFamily !== undefined) {
    declarations.push(["fontFamily", cell.fontFamily]);
  }
  if (cell.bold) {
    declarations.push(["fontWeight", 700]);
  }
  if (cell.align !== undefined) {
    declarations.push(["textAlign", cell.align]);
  }
  const style = styleAttr(declarations);
  if (style) {
    attrs += ` ${style}`;
  }
  return `<td${attrs}>${cellHtml(cell.text)}</td>`;
}

/**
 * The CSS `background-color` value for a cell, or undefined when it has no fill. A
 * translucent fill becomes an `rgba()` so only the cell background fades (not its
 * text, as a `td`-level `opacity` would); an opaque fill stays the plain hex.
 */
function cellFillStyle(cell: TableCell): string | undefined {
  if (cell.backgroundColor === undefined) {
    return undefined;
  }
  if (cell.backgroundOpacity === undefined) {
    return cell.backgroundColor;
  }
  return rgba(cell.backgroundColor, cell.backgroundOpacity);
}

/** Escapes a cell's text for MDX flow content, rendering newlines as line breaks. */
function cellHtml(text: string): string {
  return escapeMdxText(text).replace(/\n/g, "<br/>");
}

/** Indents every non-blank line by two spaces (slide content sits inside `<Slide>`). */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join("\n");
}
