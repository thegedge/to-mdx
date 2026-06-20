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

export interface Slide {
  title?: string;
  body: Paragraph[];
  /** Free-standing text boxes, each a run of paragraphs. */
  textBoxes: Paragraph[][];
  images: SlideImage[];
  /** Best-effort count of tables we detected but did not fully extract. */
  tableCount: number;
  notes: Paragraph[];
}

export interface Presentation {
  title: string;
  slides: Slide[];
}
