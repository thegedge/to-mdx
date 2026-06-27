import { centeringLayoutClass, isFullBleed, type LayoutBox, normalizeLayoutClass } from "../../../heuristics/slide-layout.ts";
import { cls } from "../../../utils.ts";
import { pctX, pctY, validSlideSize } from "./style.ts";

// Re-exported so the Keynote extractors/renderer keep importing them from here.
export { isFullBleed, normalizeLayoutClass };

/** A drawable's geometry in slide (point) coordinates, as decoded from the archive. */
export interface RawBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees (Keynote's counter-clockwise, y-up); absent/0 when unrotated. */
  angle?: number;
}

interface GeometryLike {
  position?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
  angle?: number;
}

/**
 * A drawable's bounding box lives on the `TSD.GeometryArchive` reached through the
 * `super` chain (shallow), mirroring how `parentReference` finds `parent`. Shared
 * by the text pass (free-box positioning) and the image-placement pass.
 */
export function drawableGeometry(message: unknown): RawBox | undefined {
  let node: unknown = message;
  for (let depth = 0; node && typeof node === "object" && depth < 8; depth += 1) {
    const geometry = (node as { geometry?: GeometryLike }).geometry;
    const position = geometry?.position;
    const size = geometry?.size;
    if (
      position?.x !== undefined &&
      position.y !== undefined &&
      size?.width !== undefined &&
      size.height !== undefined
    ) {
      return { x: position.x, y: position.y, width: size.width, height: size.height, angle: geometry?.angle };
    }
    node = (node as { super?: unknown }).super;
  }
  return undefined;
}

/**
 * Slide-size-percentage thresholds for treating an image as a full-bleed
 * background: either it covers ≳90% of both axes, or it sits flush to the
 * top-left (inset ≤2%) and spans ≳98% of both axes (i.e. bleeds off the edge).
 */
/**
 * Maps a Keynote master ("template") slide name to the CSS layout vocabulary the
 * ODP path already uses. First pass: tunable — these names track the stock
 * Keynote themes, and real decks rename or add masters freely.
 */
const MASTER_NAME_CLASSES: Record<string, string> = {
  "Title - Center": "title",
  "Title & Speaker": "title",
  "Title & Bullets": "title-with-points",
  Comparison: "comparison",
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

  const className = normalizeLayoutClass(cls(fromMaster, fromTitle, fromCentering));
  return className.length > 0 ? className : undefined;
}

/**
 * Bounding box of every contentful drawable, converted to slide-size percentages
 * for the shared centering kernel. Returns null when there is nothing to box or
 * the slide size is degenerate.
 */
export function contentBoxPercent(geometries: RawBox[], slideSize: { width: number; height: number }): LayoutBox | null {
  if (geometries.length === 0 || !validSlideSize(slideSize)) {
    return null;
  }

  const minX = Math.min(...geometries.map((box) => box.x));
  const minY = Math.min(...geometries.map((box) => box.y));
  const maxX = Math.max(...geometries.map((box) => box.x + box.width));
  const maxY = Math.max(...geometries.map((box) => box.y + box.height));

  return {
    left: pctX(minX, slideSize),
    top: pctY(minY, slideSize),
    width: pctX(maxX - minX, slideSize),
    height: pctY(maxY - minY, slideSize),
  };
}
