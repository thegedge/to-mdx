/** Format-agnostic slide-layout heuristics shared by the ODP and Keynote paths. */

/** A box on the slide, expressed as percentages (0–100) of the slide size. */
export interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Classifies a single content box as "mostly centered" on the slide. A box whose
 * centre sits near the slide's middle reads as a centered layout; one that also
 * spans the full width or height reads as a centered blank. Returns null when the
 * box is off-centre (or its values are not finite).
 */
export function centeringLayoutClass(box: LayoutBox): "centered" | "centered blank" | null {
  const centerX = box.left + 0.5 * box.width;
  const centerY = box.top + 0.5 * box.height;

  const horizontally = centerX > 45.0 && centerX < 65.0;
  const vertically = centerY > 45.0 && centerY < 65.0;
  const fullWidth = box.width > 95.0;
  const fullHeight = box.height > 95.0;

  if (horizontally && vertically) {
    if (fullHeight || fullWidth) {
      return "centered blank";
    }
    return "centered";
  }

  return null;
}

/**
 * Normalizes a slide's layout-class list: dedupes tokens (first-seen order) and
 * lets `blank` (a full-bleed slide with no content layout) override any content
 * class (`two-column`, `centered`, …) — a blank slide is just blank.
 */
export function normalizeLayoutClass(className: string): string {
  const seen = new Set<string>();
  const tokens = className.split(/\s+/).filter((token) => token.length > 0 && !seen.has(token) && seen.add(token));
  if (seen.has("blank")) {
    return "blank";
  }
  return tokens.join(" ");
}

const FULL_BLEED = { minCoverage: 90, maxInset: 2, minExtent: 98 } as const;

/** Whether a box is large enough to serve as the slide's background (full-bleed). */
export function isFullBleed(box: LayoutBox): boolean {
  const coversBoth = box.width >= FULL_BLEED.minCoverage && box.height >= FULL_BLEED.minCoverage;
  const bleedsX = box.left <= FULL_BLEED.maxInset && box.left + box.width >= FULL_BLEED.minExtent;
  const bleedsY = box.top <= FULL_BLEED.maxInset && box.top + box.height >= FULL_BLEED.minExtent;
  return coversBoth || (bleedsX && bleedsY);
}
