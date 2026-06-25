/** Clusters near-identical colors into shared palette variables, deriving translucent ones from the base. */

import { colorName, parseColor, type Rgb } from "./color-name.ts";

/** A distinct color and how many times it is used across the document. */
export interface ColorUse {
  color: string;
  count: number;
}

export interface HoistedColors {
  /** A color string → its replacement: `var(--name)` for opaque, `rgb(from var(--name) r g b / a)` for translucent. */
  replacements: Map<string, string>;
  /** The palette variables to define, in first-seen cluster order. */
  definitions: Array<{ name: string; hex: string }>;
}

/** Default RGB Euclidean distance under which two colors are "sufficiently close" to merge. */
const DEFAULT_THRESHOLD = 16;

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function averageRgb(colors: readonly Rgb[]): Rgb {
  const sum = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
  return { r: Math.round(sum.r / colors.length), g: Math.round(sum.g / colors.length), b: Math.round(sum.b / colors.length) };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

interface ParsedUse extends ColorUse {
  rgb: Rgb;
  alpha: number;
}

/**
 * Groups colors used 2+ times (combined) into one palette variable each, merging
 * any that are within `threshold` RGB distance by averaging them — so a handful of
 * near-identical dark blues collapse to a single `--blue1`. A translucent color
 * shares its cluster's base variable and re-adds its alpha via relative-color
 * syntax (`rgb(from var(--blue1) r g b / 0.15)`), instead of getting its own var.
 * Colors that don't reach the 2-use threshold (alone in their cluster) are left
 * literal.
 */
export function buildColorVars(uses: readonly ColorUse[], threshold = DEFAULT_THRESHOLD): HoistedColors {
  const parsed: ParsedUse[] = [];
  for (const use of uses) {
    const color = parseColor(use.color);
    if (color) {
      parsed.push({ ...use, rgb: color.rgb, alpha: color.alpha });
    }
  }

  // Leader clustering: each color joins the nearest existing cluster within the
  // threshold, else starts a new one — a deliberately simple, order-stable pass.
  const clusters: Array<{ leader: Rgb; members: ParsedUse[] }> = [];
  for (const use of parsed) {
    let best: { leader: Rgb; members: ParsedUse[] } | undefined;
    let bestDistance = threshold;
    for (const cluster of clusters) {
      const d = distance(use.rgb, cluster.leader);
      if (d <= bestDistance) {
        best = cluster;
        bestDistance = d;
      }
    }
    if (best) {
      best.members.push(use);
    } else {
      clusters.push({ leader: use.rgb, members: [use] });
    }
  }

  const replacements = new Map<string, string>();
  const definitions: Array<{ name: string; hex: string }> = [];
  const nameCounts = new Map<string, number>();
  for (const cluster of clusters) {
    const total = cluster.members.reduce((sum, member) => sum + member.count, 0);
    if (total < 2) {
      continue;
    }
    const hex = toHex(averageRgb(cluster.members.map((member) => member.rgb)));
    const base = colorName(hex);
    const ordinal = (nameCounts.get(base) ?? 0) + 1;
    nameCounts.set(base, ordinal);
    const name = `${base}${ordinal}`;
    definitions.push({ name, hex });

    for (const member of cluster.members) {
      replacements.set(member.color, member.alpha >= 1 ? `var(--${name})` : `rgb(from var(--${name}) r g b / ${member.alpha})`);
    }
  }

  return { replacements, definitions };
}
