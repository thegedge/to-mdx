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
