import { centeringLayoutClass, type LayoutBox } from "../../../heuristics/slide-layout.ts";
import { cls } from "../../../utils.ts";

/** A drawable's geometry in slide (point) coordinates, as decoded from the archive. */
export interface RawBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps a Keynote master ("template") slide name to the CSS layout vocabulary the
 * ODP path already uses. First pass: tunable — these names track the stock
 * Keynote themes, and real decks rename or add masters freely.
 */
const MASTER_NAME_CLASSES: Record<string, string> = {
  "Title - Center": "title",
  "Title & Speaker": "title",
  "Title & Bullets": "title-with-points",
  Comparison: "two-column",
  Photo: "blank",
  "Photo & Text": "blank",
};

/** Slide titles that map directly to the `thank-you` closing layout. */
const THANK_YOU_TITLES = new Set(["thanks!", "thank you"]);

/** The `thank-you` layout class for a closing slide whose title says thanks. */
function thankYouClass(title: string | undefined): string | undefined {
  return title && THANK_YOU_TITLES.has(title.trim().toLowerCase()) ? "thank-you" : undefined;
}

export interface SlideLayoutInput {
  /** The slide's master/template name, if resolvable. */
  masterName?: string;
  /** The slide's resolved title, for title-based layout rules. */
  title?: string;
  /** Bounding box of the slide's contentful drawables, in slide-size percentages. */
  contentBox?: LayoutBox | null;
}

/**
 * Derives a slide's layout CSS class from its master name, its title, and the
 * geometry of its content, reusing the shared centering kernel. Returns undefined
 * when nothing classifies. Callers gate this on `options.useHeuristics`.
 */
export function slideLayoutClass({ masterName, title, contentBox }: SlideLayoutInput): string | undefined {
  const fromMaster = masterName ? MASTER_NAME_CLASSES[masterName] : undefined;
  const fromTitle = thankYouClass(title);
  const fromCentering = contentBox ? centeringLayoutClass(contentBox) : null;

  const className = cls(fromMaster, fromTitle, fromCentering);
  return className.length > 0 ? className : undefined;
}

/**
 * Bounding box of every contentful drawable, converted to slide-size percentages
 * for the shared centering kernel. Returns null when there is nothing to box or
 * the slide size is degenerate.
 */
export function contentBoxPercent(geometries: RawBox[], slideSize: { width: number; height: number }): LayoutBox | null {
  if (geometries.length === 0 || slideSize.width <= 0 || slideSize.height <= 0) {
    return null;
  }

  const minX = Math.min(...geometries.map((box) => box.x));
  const minY = Math.min(...geometries.map((box) => box.y));
  const maxX = Math.max(...geometries.map((box) => box.x + box.width));
  const maxY = Math.max(...geometries.map((box) => box.y + box.height));

  return {
    left: (minX / slideSize.width) * 100,
    top: (minY / slideSize.height) * 100,
    width: ((maxX - minX) / slideSize.width) * 100,
    height: ((maxY - minY) / slideSize.height) * 100,
  };
}
