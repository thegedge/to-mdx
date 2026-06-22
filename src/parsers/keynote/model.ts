/** Intermediate, format-agnostic representation extracted from the Keynote archive. */

export interface Paragraph {
  /** List/indent depth; 0 = top level. */
  depth: number;
  text: string;
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
  /** Text color as `#RRGGBB`. */
  color?: string;
  /** 700 when the dominant run is bold; otherwise omitted. */
  fontWeight?: number;
  textAlign?: "left" | "right" | "center" | "justify";
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
 * A table's extracted cell text. `rows` is row-major; each row is a fixed-length
 * array of `numberOfColumns` cells, with an empty string for blank/non-text cells.
 */
export interface TableData {
  rows: string[][];
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
  title?: string;
  body: Paragraph[];
  textBoxes: TextBox[];
  images: SlideImage[];
  /** Resolved `Data/`-relative file names of movies/videos placed on the slide. */
  videos: string[];
  /** Tables whose cell text we extracted, in slide (drawable) order. */
  tables: TableData[];
  /** Count of tables we detected but could not extract (missing/lost refs). */
  tableCount: number;
  notes: Paragraph[];
}

export interface Presentation {
  title: string;
  slides: Slide[];
  /**
   * Distinct `Data/`-relative file names of images that resolve to a file but
   * could not be linked to any slide (their container was lost to a partially
   * decoded `.iwa` chunk). Sorted; emitted in a trailing appendix so the content
   * is preserved for manual placement.
   */
  unplacedImages: string[];
}
