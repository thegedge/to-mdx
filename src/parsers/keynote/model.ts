/** Intermediate, format-agnostic representation extracted from the Keynote archive. */

import type { LayoutBox } from "../../heuristics/slide-layout.ts";

export interface Paragraph {
  /** List/indent depth; 0 = top level. */
  depth: number;
  text: string;
  /**
   * The paragraph with its leading whitespace preserved (trailing whitespace
   * still trimmed). Carried only when it differs from `text` (i.e. the line is
   * indented), so literal contexts like fenced code can keep their indentation
   * while prose/bullets keep using the fully-trimmed `text`.
   */
  raw?: string;
  /**
   * This paragraph's own `var(--text-*)` font-size token, resolved from its
   * paragraph style's point size (slide-height-relative). Carried only for free
   * positioned text boxes whose paragraphs mix sizes, so the renderer can size
   * each line independently; absent for uniform boxes and flow content
   * (headings/bullets/code), which keep a single box-level size.
   */
  fontSizeToken?: string;
  /**
   * A hyperlink URL covering the whole paragraph, lifted from the text storage's
   * smart-field table (e.g. the "Attribution: …" credits). Present only when a link
   * field spans the paragraph; the renderer wraps the text in a markdown link.
   */
  link?: string;
}

export interface SlideImage {
  /** Resolved `Data/`-relative file name as stored in the zip. */
  fileName: string;
  altText: string;
  /**
   * The image's bounding box as slide-size percentages, lifted from the
   * drawable's geometry. Present only when geometry resolved; drives absolute
   * positioning (`.kn-img-*`) and full-bleed-background detection.
   */
  box?: TextBoxGeometry;
  /**
   * Cropping geometry for a masked image: the mask exposes only a sub-rectangle
   * of the full image. Present only when the `ImageArchive` carries a resolvable
   * `mask` with geometry; drives a clipping wrapper around the `<img>`.
   */
  crop?: ImageCrop;
  /**
   * Marks a master-inherited, full-bleed image as a slide backdrop: the renderer
   * forces its `zIndex` to 0 (behind all slide content) instead of the positioned
   * default, so it sits behind text like the cover background while keeping its own
   * geometry/crop. Set only for full-bleed images layered in from the master.
   */
  backdrop?: boolean;
  /**
   * The image's own opacity (0–1, rounded to 3 decimals) from its
   * `MediaStyleArchive` (`mediaProperties.opacity`), i.e. Keynote's Style-tab
   * opacity. Present only when set and translucent (`< 1`); a fully opaque image
   * omits it so the renderer emits no `opacity`.
   */
  opacity?: number;
  /**
   * The drawable's back-to-front rank within its slide's `drawablesZOrder`
   * (higher = nearer the front), resolved via its top-most z-ordered ancestor for
   * grouped images. Drives the rendered `zIndex`; absent when the slide declares
   * no z-order (older decks) so the renderer keeps its type-based default.
   */
  zOrder?: number;
}

/**
 * A masked image's crop, split into the visible container rectangle (placed on
 * the slide) and the inner `<img>` placement inside it. The container is
 * positioned in slide-size percentages; the inner image is sized/offset in
 * percentages of the container, so the full image shows clipped to the mask.
 */
export interface ImageCrop {
  /** Visible container rectangle on the slide, in slide-size percentages. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Inner `<img>` placement, as percentages of the container. */
  imgLeft: number;
  imgTop: number;
  imgWidth: number;
  imgHeight: number;
}

/**
 * A movie/video placed on a slide: its resolved `Data/`-relative file name plus
 * its bounding box (when geometry resolved), mirroring `SlideImage.box`. The box
 * lets the renderer distinguish a full-bleed cover video from a positioned one.
 */
export interface SlideVideo {
  /** Resolved `Data/`-relative file name as stored in the zip. */
  fileName: string;
  /** The video's bounding box as slide-size percentages; present only when geometry resolved. */
  box?: TextBoxGeometry;
  /** Back-to-front rank within the slide's `drawablesZOrder`; see `SlideImage.zOrder`. */
  zOrder?: number;
}

/**
 * An image fill on a vector shape: the shape is painted with this image (covering
 * its bounding box via a `<pattern>`) plus an optional color `tint` overlay,
 * instead of a flat `fill` color. The renderer emits one shared `<pattern>` per
 * unique image+tint and points the shape's `fill` at it.
 */
export interface ImageFill {
  /** Resolved `Data/`-relative file name of the fill image. */
  fileName: string;
  /** Tint overlaid on the image as `#rrggbb`; absent when the tint is fully transparent. */
  tintColor?: string;
  /** Tint overlay alpha (0–1, rounded); paired with `tintColor`, absent when the tint is. */
  tintOpacity?: number;
}

/**
 * A vector shape (line, arrow, icon path) in LOCAL coordinates, positioned by a
 * per-instance `transform`. The local `d` is deduped into a document-level
 * `<defs>` and referenced by `<use>`; the transform (and the style fields below)
 * ride the `<use>`. `markerStart`/`markerEnd` flag a resolved line-end arrowhead.
 */
export interface SvgPath {
  /** SVG `d` in the path's own coordinate space (bounding box at origin); shared via `<defs>`/`<use>`. */
  localD: string;
  /** SVG `transform` placing the local path on the slide; absent when it is the identity. */
  transform?: string;
  stroke: string;
  /** Stroke width in slide units; absent when there is no stroke (`stroke: "none"`). */
  strokeWidth?: number;
  /** Solid fill color (`#rrggbb` or CSS color); absent for a no-fill outline or an `imageFill`. */
  fill?: string;
  /**
   * An image fill painting the shape with an image (plus optional tint) instead of
   * a solid `fill`. Mutually exclusive with `fill`: when set, the renderer points
   * the shape at the shared `<pattern>` for this image and emits no solid `fill`.
   */
  imageFill?: ImageFill;
  /** SVG `stroke-dasharray` for a dotted/dashed stroke; absent when solid. */
  strokeDasharray?: string;
  /** SVG `stroke-linecap` (e.g. "round"); absent when the default butt cap applies. */
  strokeLinecap?: string;
  /** Fill alpha (0–1) when the resolved fill color is translucent. */
  fillOpacity?: number;
  /** Stroke alpha (0–1) when the resolved stroke color is translucent. */
  strokeOpacity?: number;
  /**
   * The shape's group-level Style-tab opacity (0–1, rounded to 3 decimals) from
   * `shapeProperties.opacity`, applied to the whole `<path>` (distinct from the
   * per-channel fill/stroke opacities). Present only when translucent (`< 1`).
   */
  opacity?: number;
  markerStart?: boolean;
  markerEnd?: boolean;
  /** Back-to-front rank within the slide's `drawablesZOrder`; see `SlideImage.zOrder`. */
  zOrder?: number;
}

/** A box on the slide as percentages of the slide size (the shared layout box). */
export type TextBoxGeometry = LayoutBox;

/** Dominant visual styling extracted from a free text box's first paragraph/run. */
export interface TextBoxStyle {
  /**
   * The box's rotation in CSS degrees (clockwise, y-down — converted from Keynote's
   * counter-clockwise y-up angle), applied as a `rotate()` about the box centre.
   * Present only when the box is rotated (e.g. a "SYN"/"Data" label aligned to a
   * diagonal arrow); omitted when axis-aligned.
   */
  rotation?: number;
  /** A `var(--text-*)` token nearest the box's point size. */
  fontSizeToken?: string;
  /** CSS font family lifted from the run's PostScript font name (e.g. "Shopify Sans"). */
  fontFamily?: string;
  /** Text color as `#RRGGBB`. */
  color?: string;
  /** 700 when the dominant run is bold; otherwise omitted. */
  fontWeight?: number;
  textAlign?: "left" | "right" | "center" | "justify";
  /**
   * The box's shape fill rendered as a CSS color (`#rrggbb`, or `rgba(...)` when
   * translucent): a solid fill's color, or an image fill's `tint`. Present only
   * for free (non-placeholder) text boxes whose shape carries a resolvable fill.
   */
  backgroundColor?: string;
  /**
   * The box's shape stroke as a CSS `border` shorthand (e.g. `"2px solid #223274"`),
   * lifted from the backing shape's `stroke`. Present only for free text boxes
   * whose shape carries a real (non-empty) stroke.
   */
  border?: string;
  /**
   * The box's shape stroke when it is a SMART (artistic "brush") stroke, e.g. the
   * named `"Pen"` stroke, as a `{ color, width }` pair. Mutually exclusive with
   * `border`: a brush stroke renders as a hand-drawn "rough"-filtered SVG `<rect>`
   * overlay instead of a flat CSS border. Present only for free text boxes whose
   * shape carries a smart stroke.
   */
  brushBorder?: { color: string; width: number };
  /**
   * The box's corner radius as a CSS `border-radius` percentage (e.g. `"8.9%"`),
   * lifted from a rounded-rectangle shape's `scalarPathSource` (its corner-radius
   * scalar over the box's smaller natural dimension). Present only for free text
   * boxes backed by a rounded-rect shape; absent for sharp-cornered boxes.
   */
  borderRadius?: string;
  /**
   * A character outline as a CSS `-webkit-text-stroke` value (`"<width>px <color>"`,
   * e.g. `"5px #000000"`), lifted from the run's `tsdStroke`. Present only when a
   * real stroke is set (an explicit `tsdStrokeNull` yields none).
   */
  textStroke?: string;
  /**
   * The backing shape's group-level Style-tab opacity (0–1, rounded to 3 decimals)
   * from `shapeProperties.opacity`, applied to the whole box. Present only when the
   * shape is translucent (`< 1`).
   */
  opacity?: number;
  /**
   * A CSS `text-shadow` (`"<dx>px <dy>px <blur>px <color>"`) lifted from the backing
   * shape's drop `shadow` (`shapeProperties.shadow`). Present only when the shape
   * carries a real, enabled shadow (an empty `{}` yields none).
   */
  textShadow?: string;
}

/**
 * A free-standing text box: either prose paragraphs or a detected code snippet.
 * Prose boxes may carry positioning (`box`) and visual styling (`style`) lifted
 * from the slide so the renderer can place them absolutely; code boxes do not.
 */
export type TextBox =
  | { kind: "text"; paragraphs: Paragraph[]; box?: TextBoxGeometry; style?: TextBoxStyle; zOrder?: number }
  | { kind: "code"; language: string; text: string };

/**
 * One rendered table cell: its text plus how many columns/rows it spans. Spans
 * are derived from the sparsity of Keynote's per-row cell-offset array (a
 * `0xFFFF` slot means the column is covered by a merge), so only anchor cells are
 * carried — covered columns are absorbed into the anchor's `colSpan`/`rowSpan`.
 */
export interface TableCell {
  text: string;
  /** Columns this cell occupies, including itself (>= 1). */
  colSpan: number;
  /** Rows this cell occupies, including itself (>= 1). */
  rowSpan: number;
  /**
   * The cell's resolved background fill as `#RRGGBB`, from its per-cell style (or
   * the positional header/footer/body default when the cell carries no per-cell
   * style). Absent when the effective fill is transparent / not a solid color.
   */
  backgroundColor?: string;
  /** Background-fill alpha (0–1, rounded to 3 decimals) when the fill is translucent. */
  backgroundOpacity?: number;
  /**
   * The cell's resolved text color as `#RRGGBB`, from a per-cell rich-text run
   * color when present, else the positional header/footer/column/body text style.
   * Absent when no text style resolves a solid color.
   */
  color?: string;
  /**
   * The cell's resolved CSS font family (e.g. `"Shopify Sans"`), from the positional
   * header/footer/column/body text style's `charProperties.fontName`. Absent when no
   * text style resolves a font name.
   */
  fontFamily?: string;
  /**
   * The cell's text alignment (`left`/`right`/`center`/`justify`). Defaults to
   * `center` for every extracted cell, with an explicit paragraph alignment from
   * the resolved text style taking precedence.
   */
  align?: string;
  /**
   * `true` when the cell's resolved text style is bold (its own per-cell text
   * style's `charProperties.bold`, else the positional band style's). Rendered as
   * `fontWeight: 700`; absent when the cell is not bold.
   */
  bold?: boolean;
}

/**
 * A table's extracted cells. `rows` is row-major in stored order; each row holds
 * only its anchor cells (in column order). Covered columns are omitted and folded
 * into the spanning anchor, matching the standard merged HTML-table model.
 */
export interface TableData {
  rows: TableCell[][];
  /** Position/size on the slide (percent), so the table sits where Keynote placed it. */
  box?: TextBoxGeometry;
}

export interface Slide {
  /** Slide-layout CSS class derived from heuristics; absent when heuristics are off. */
  className?: string;
  /**
   * File name of a dominant full-bleed image promoted to the slide background
   * (rendered `cover`, behind content). When set, that image is removed from
   * `images` so it is not also rendered inline.
   */
  background?: string;
  /**
   * Solid background fill color (`#RRGGBB`) resolved from the slide's style, drawn
   * behind all content. Matters where a background image doesn't fully cover the
   * slide. Absent when the style declares no solid fill (gradient/image ignored).
   */
  backgroundColor?: string;
  /**
   * A CSS color (`#rrggbb`, or `rgba(...)` when translucent) laid as a full-bleed
   * overlay over the background image, from a style image fill's `tint`. Present
   * only when the slide's `slideProperties.fill` is a tinted image fill; rendered
   * above the background image and below content.
   */
  backgroundTint?: string;
  title?: string;
  body: Paragraph[];
  textBoxes: TextBox[];
  /** Vector shapes (lines/arrows/icons) drawn as one overlaid SVG; absent when none. */
  shapes?: SvgPath[];
  images: SlideImage[];
  /** Movies/videos placed on the slide, with optional geometry for full-bleed detection. */
  videos: SlideVideo[];
  /** Tables whose cell text we extracted, in slide (drawable) order. */
  tables: TableData[];
  /** Count of tables we detected but could not extract (missing/lost refs). */
  tableCount: number;
  notes: Paragraph[];
}

export interface Presentation {
  title: string;
  slides: Slide[];
  /** Slide size in points; sets the SVG `viewBox` for overlaid vector shapes. */
  slideSize?: { width: number; height: number };
  /**
   * Distinct `Data/`-relative file names of images that resolve to a file but
   * could not be linked to any slide (their container was lost to a partially
   * decoded `.iwa` chunk). Sorted; emitted in a trailing appendix so the content
   * is preserved for manual placement.
   */
  unplacedImages: string[];
}
