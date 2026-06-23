/** Intermediate, format-agnostic representation extracted from the Keynote archive. */

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
}

/**
 * A vector shape (line, arrow, icon path) baked into absolute slide-point
 * coordinates, ready to render as one SVG `<path>`. `markerStart`/`markerEnd`
 * flag a resolved line-end arrowhead.
 */
export interface SvgPath {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  /** SVG `stroke-dasharray` for a dotted/dashed stroke; absent when solid. */
  strokeDasharray?: string;
  /** SVG `stroke-linecap` (e.g. "round"); absent when the default butt cap applies. */
  strokeLinecap?: string;
  /** Fill alpha (0–1) when the resolved fill color is translucent. */
  fillOpacity?: number;
  /** Stroke alpha (0–1) when the resolved stroke color is translucent. */
  strokeOpacity?: number;
  markerStart?: boolean;
  markerEnd?: boolean;
}

/** A free text box's bounding box, expressed as percentages of the slide size. */
export interface TextBoxGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Dominant visual styling extracted from a free text box's first paragraph/run. */
export interface TextBoxStyle {
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
   * A character outline as a CSS `-webkit-text-stroke` value (`"<width>px <color>"`,
   * e.g. `"5px #000000"`), lifted from the run's `tsdStroke`. Present only when a
   * real stroke is set (an explicit `tsdStrokeNull` yields none).
   */
  textStroke?: string;
}

/**
 * A free-standing text box: either prose paragraphs or a detected code snippet.
 * Prose boxes may carry positioning (`box`) and visual styling (`style`) lifted
 * from the slide so the renderer can place them absolutely; code boxes do not.
 */
export type TextBox =
  | { kind: "text"; paragraphs: Paragraph[]; box?: TextBoxGeometry; style?: TextBoxStyle }
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
}

/**
 * A table's extracted cells. `rows` is row-major in stored order; each row holds
 * only its anchor cells (in column order). Covered columns are omitted and folded
 * into the spanning anchor, matching the standard merged HTML-table model.
 */
export interface TableData {
  rows: TableCell[][];
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
