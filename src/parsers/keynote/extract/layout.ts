import { centeringLayoutClass, type LayoutBox } from "../../../heuristics/slide-layout.ts";
import type { TextBoxGeometry } from "../model.ts";
import { cls } from "../../../utils.ts";

/** A drawable's geometry in slide (point) coordinates, as decoded from the archive. */
export interface RawBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GeometryLike {
  position?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
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
      return { x: position.x, y: position.y, width: size.width, height: size.height };
    }
    node = (node as { super?: unknown }).super;
  }
  return undefined;
}

/**
 * Slide-size-percentage thresholds for treating an image as a full-bleed
 * background: either it covers ≳95% of both axes, or it sits flush to the
 * top-left (inset ≤2%) and spans ≳98% of both axes (i.e. bleeds off the edge).
 */
const FULL_BLEED = { minCoverage: 95, maxInset: 2, minExtent: 98 } as const;

/** Whether an image box is large enough to serve as the slide's background. */
export function isFullBleed(box: TextBoxGeometry): boolean {
  const coversBoth = box.width >= FULL_BLEED.minCoverage && box.height >= FULL_BLEED.minCoverage;
  const bleedsX = box.left <= FULL_BLEED.maxInset && box.left + box.width >= FULL_BLEED.minExtent;
  const bleedsY = box.top <= FULL_BLEED.maxInset && box.top + box.height >= FULL_BLEED.minExtent;
  return coversBoth || (bleedsX && bleedsY);
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
