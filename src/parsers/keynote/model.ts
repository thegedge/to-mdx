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
}

/** A free-standing text box: either prose paragraphs or a detected code snippet. */
export type TextBox =
  | { kind: "text"; paragraphs: Paragraph[] }
  | { kind: "code"; language: string; text: string };

export interface Slide {
  title?: string;
  body: Paragraph[];
  textBoxes: TextBox[];
  images: SlideImage[];
  /** Resolved `Data/`-relative file names of movies/videos placed on the slide. */
  videos: string[];
  /** Best-effort count of tables we detected but did not fully extract. */
  tableCount: number;
  notes: Paragraph[];
}

export interface Presentation {
  title: string;
  slides: Slide[];
}
