/** Names a CSS color by its rough hue (red/yellow/blue/…) so palette variables read better than `paletteN`. */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses a `#rgb`/`#rrggbb`/`#rrggbbaa` or `rgb()`/`rgba()` color to 0–255 RGB, or null if unrecognized. */
function parseRgb(color: string): Rgb | null {
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(color.trim());
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = [...digits].map((d) => d + d).join("");
    }
    if (digits.length < 6) {
      return null;
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(color.trim());
  if (fn) {
    const [r, g, b] = fn[1].split(",").map((part) => Number(part.trim()));
    if ([r, g, b].some((value) => Number.isNaN(value))) {
      return null;
    }
    return { r, g, b };
  }

  return null;
}

/** RGB (0–255) to HSL, with hue in degrees and saturation/lightness in 0–1. */
function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }
  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** Hue ranges (degrees, upper-exclusive) mapped to names; red wraps around 360. */
const HUE_NAMES: ReadonlyArray<{ max: number; name: string }> = [
  { max: 15, name: "red" },
  { max: 45, name: "orange" },
  { max: 70, name: "yellow" },
  { max: 165, name: "green" },
  { max: 195, name: "cyan" },
  { max: 255, name: "blue" },
  { max: 285, name: "purple" },
  { max: 345, name: "pink" },
  { max: 360, name: "red" },
];

/**
 * A short hue name for a CSS color: a grayscale color is `black`/`gray`/`white` by
 * lightness; otherwise the hue bucket (`red`, `orange`, `yellow`, …). Falls back to
 * `color` for anything unparseable.
 */
export function colorName(color: string): string {
  const rgb = parseRgb(color);
  if (!rgb) {
    return "color";
  }
  const { h, s, l } = toHsl(rgb);

  if (s < 0.12) {
    if (l < 0.15) {
      return "black";
    }
    return l > 0.85 ? "white" : "gray";
  }
  return HUE_NAMES.find((bucket) => h < bucket.max)?.name ?? "color";
}
