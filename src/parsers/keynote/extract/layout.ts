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
  "Title - Center": "title centered",
  "Title & Speaker": "title",
  "Title & Bullets": "title-with-points",
  Comparison: "two-column",
  Photo: "blank",
  "Photo & Text": "blank",
};

export interface SlideLayoutInput {
  /** The slide's master/template name, if resolvable. */
  masterName?: string;
  /** Bounding box of the slide's contentful drawables, in slide-size percentages. */
  contentBox?: LayoutBox | null;
}

/**
 * Derives a slide's layout CSS class from its master name and the geometry of its
 * content, reusing the shared centering kernel. Returns undefined when nothing
 * classifies. Callers gate this on `options.useHeuristics`.
 */
export function slideLayoutClass({ masterName, contentBox }: SlideLayoutInput): string | undefined {
  const fromMaster = masterName ? MASTER_NAME_CLASSES[masterName] : undefined;
  const fromCentering = contentBox ? centeringLayoutClass(contentBox) : null;

  const className = cls(fromMaster, fromCentering);
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
