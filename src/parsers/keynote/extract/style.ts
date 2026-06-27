import type { ImageCrop, TextBoxGeometry, TextBoxStyle } from "../model.ts";
import type { Registry } from "../registry.ts";
import type {
  CharacterStyleArchive,
  Color,
  MediaStyleArchive,
  ParagraphStyleArchive,
  StorageArchive,
  StrokeArchive,
} from "../types.ts";
import type { RawBox } from "./layout.ts";
import type { ResolvedFill } from "./shapes.ts";
import { firstInSuperChain, type SuperChainNode } from "./super-chain.ts";

/**
 * The zoom-relative `--text-*` font-size tokens used by the slides stylesheet,
 * paired with their approximate pixel size. Keynote stores sizes in points; we
 * map a point size to the nearest token rather than emitting a raw value, so the
 * output rides the deck's existing responsive scale.
 */
const FONT_SIZE_TOKENS: ReadonlyArray<{ token: string; px: number }> = [
  { token: "4xs", px: 4 },
  { token: "3xs", px: 8 },
  { token: "2xs", px: 10 },
  { token: "xs", px: 12 },
  { token: "sm", px: 14 },
  { token: "base", px: 16 },
  { token: "lg", px: 18 },
  { token: "xl", px: 20 },
  { token: "2xl", px: 24 },
  { token: "3xl", px: 30 },
  { token: "4xl", px: 36 },
  { token: "5xl", px: 48 },
  { token: "6xl", px: 64 },
  { token: "7xl", px: 72 },
  { token: "8xl", px: 96 },
  { token: "9xl", px: 128 },
];

/**
 * Reference height (px) a font's fraction of slide height is scaled against before
 * picking a token. Keynote point sizes are absolute to the deck's large canvas, so
 * we render the font as if the slide were this many px tall instead. Tuned on the
 * 1920×1080 reference deck so body text lands on `--text-lg`, titles on `--text-4xl`.
 */
const SLIDE_FONT_REFERENCE_PX = 512;

/**
 * Maps a Keynote point size to the nearest `var(--text-*)` token (capped at the
 * scale ends). A supplied slide height rescales the size by its fraction of slide
 * height (see `SLIDE_FONT_REFERENCE_PX`) so the token reflects how large it reads;
 * a missing height falls back to the raw point size.
 */
export function fontSizeToken(pt: number, slideHeightPt?: number): string {
  const px = slideHeightPt && slideHeightPt > 0 ? (pt / slideHeightPt) * SLIDE_FONT_REFERENCE_PX : pt;
  let best = FONT_SIZE_TOKENS[0];
  for (const candidate of FONT_SIZE_TOKENS) {
    if (Math.abs(candidate.px - px) < Math.abs(best.px - px)) {
      best = candidate;
    }
  }
  return `var(--text-${best.token})`;
}

/** Renders one 0–1 float color channel as a clamped, rounded two-digit hex byte. */
function channelHex(value: number | undefined): string {
  const clamped = Math.min(1, Math.max(0, value ?? 0));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
}

/** Converts a TSP color's 0–1 RGB floats to a `#RRGGBB` string (missing channels are 0). */
export function colorToHex(color: Pick<Color, "r" | "g" | "b">): string {
  return `#${channelHex(color.r)}${channelHex(color.g)}${channelHex(color.b)}`;
}

/** True when a color carries at least one RGB channel (so it renders, rather than being absent). */
export function hasRgb(color: Color | undefined): color is Color {
  return !!color && (color.r !== undefined || color.g !== undefined || color.b !== undefined);
}

/** Rounds an alpha to 2 decimals so emitted opacity/fill values stay clean (0.85, not 0.8500608…). */
export function roundAlpha(a: number): number {
  return Math.round(a * 100) / 100;
}

/** Composes a CSS `rgba()` string from a `#RRGGBB` hex and a 0–1 alpha. */
export function rgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A resolved fill as a CSS color string: the plain hex when opaque, an `rgba()`
 * when translucent. Returns undefined when the fill is absent (so callers can
 * simply omit the property).
 */
export function fillColorCss(fill: ResolvedFill | undefined): string | undefined {
  if (!fill) {
    return undefined;
  }
  return fill.opacity === undefined ? fill.color : rgba(fill.color, fill.opacity);
}

/**
 * Maps a PostScript-ish font name to a usable CSS family: drops a trailing
 * weight/style suffix after the last `-` (`ShopifySans-Light` → `ShopifySans`),
 * then splits camelCase into words (`ShopifySans` → `Shopify Sans`). Blank names
 * yield undefined. A best effort, since the registered display name is unrecoverable.
 */
export function fontFamily(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  const dash = name.lastIndexOf("-");
  const base = (dash > 0 ? name.slice(0, dash) : name).trim();
  if (!base) {
    return undefined;
  }
  return base.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * A node in a media style's inheritance chain. `mediaProperties` may sit on the
 * instance or one level down its `super` (typed as a bare `TSS.StyleArchive` but
 * media-style-shaped at runtime), so we model it structurally to walk without casts.
 */
type MediaStyleNode = SuperChainNode<{ mediaProperties?: { opacity?: number } }>;

/**
 * The effective image opacity (0–1) from a `MediaStyleArchive`: the first
 * `mediaProperties.opacity` along the `super` chain, rounded to 3 decimals.
 * Undefined when unset or fully opaque.
 */
export function mediaOpacity(style: MediaStyleArchive | undefined): number | undefined {
  const opacity = firstInSuperChain(style as MediaStyleNode | undefined, (node) => node.mediaProperties?.opacity);
  return opacity !== undefined && opacity < 1 ? roundAlpha(opacity) : undefined;
}

/** iWork `TextAlignmentType` enum → CSS `text-align`; unknown values yield undefined. */
const ALIGNMENTS: Record<number, TextBoxStyle["textAlign"]> = {
  0: "left",
  1: "right",
  2: "center",
  3: "justify",
};

export function alignmentToken(value: number | undefined): TextBoxStyle["textAlign"] {
  return value === undefined ? undefined : ALIGNMENTS[value];
}

/** A slide size is usable for percentage math only when both dimensions are positive. */
export function validSlideSize(slideSize: { width: number; height: number }): boolean {
  return slideSize.width > 0 && slideSize.height > 0;
}

/** A point-space x-coordinate as a percentage of the slide width. */
export function pctX(value: number, slideSize: { width: number; height: number }): number {
  return (value / slideSize.width) * 100;
}

/** A point-space y-coordinate as a percentage of the slide height. */
export function pctY(value: number, slideSize: { width: number; height: number }): number {
  return (value / slideSize.height) * 100;
}

/** Converts a drawable's point-space bounding box to slide-size percentages. */
export function boxPercent(
  box: RawBox | undefined,
  slideSize: { width: number; height: number },
): TextBoxGeometry | undefined {
  if (!box || !validSlideSize(slideSize)) {
    return undefined;
  }
  return {
    left: pctX(box.x, slideSize),
    top: pctY(box.y, slideSize),
    width: pctX(box.width, slideSize),
    height: pctY(box.height, slideSize),
  };
}

/**
 * Crop geometry for a masked image. The mask frame is in the image's local space
 * (mask.parent = image), so the visible slide region is `(x+mx, y+my, mw, mh)`. The
 * container is in slide-size percentages; the inner `<img>` is sized/offset in
 * percentages of the container. Undefined when the slide or mask is zero-sized.
 */
export function maskCrop(
  image: RawBox,
  mask: RawBox,
  slideSize: { width: number; height: number },
): ImageCrop | undefined {
  if (!validSlideSize(slideSize) || mask.width <= 0 || mask.height <= 0) {
    return undefined;
  }
  return {
    left: pctX(image.x + mask.x, slideSize),
    top: pctY(image.y + mask.y, slideSize),
    width: pctX(mask.width, slideSize),
    height: pctY(mask.height, slideSize),
    imgLeft: (-mask.x / mask.width) * 100,
    imgTop: (-mask.y / mask.height) * 100,
    imgWidth: (image.width / mask.width) * 100,
    imgHeight: (image.height / mask.height) * 100,
  };
}

/**
 * Lifts the dominant visual style from a text box's storage: font size, color,
 * weight, and alignment from the first paragraph style, with a color override from
 * the first character style. A first-pass read of the first paragraph/run (no full
 * style inheritance); an empty result returns undefined.
 */
export function textBoxStyle(
  storage: StorageArchive | undefined,
  registry: Registry,
  slideHeightPt?: number,
): TextBoxStyle | undefined {
  if (!storage) {
    return undefined;
  }

  const paraStyle = registry.resolve<ParagraphStyleArchive>(storage.tableParaStyle?.entries[0]?.object);
  const charStyle = registry.resolve<CharacterStyleArchive>(storage.tableCharStyle?.entries[0]?.object);

  const charProps = paraStyle?.charProperties;
  const fontColor = charStyle?.charProperties?.fontColor ?? charProps?.fontColor;
  const family = fontFamily(charStyle?.charProperties?.fontName ?? charProps?.fontName);

  const style: TextBoxStyle = {};
  if (charProps?.fontSize !== undefined) {
    style.fontSizeToken = fontSizeToken(charProps.fontSize, slideHeightPt);
  }
  if (family) {
    style.fontFamily = family;
  }
  if (hasRgb(fontColor)) {
    style.color = colorToHex(fontColor);
  }
  if (charProps?.bold) {
    style.fontWeight = 700;
  }
  const align = alignmentToken(paraStyle?.paraProperties?.alignment);
  if (align) {
    style.textAlign = align;
  }
  const stroke = textStroke(charStyle?.charProperties, charProps);
  if (stroke) {
    style.textStroke = stroke;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * The character outline as a CSS `-webkit-text-stroke` value from the run's stroke
 * `oneof`: a `tsdStroke` (color + width) becomes `"<width>px <color>"`, while
 * `tsdStrokeNull` means "no outline". Run-level props win over paragraph-level, so
 * a run clearing the stroke suppresses a paragraph default.
 */
function textStroke(
  charProps: CharacterStyleArchive["charProperties"] | undefined,
  paraCharProps: ParagraphStyleArchive["charProperties"] | undefined,
): string | undefined {
  for (const props of [charProps, paraCharProps]) {
    if (!props) {
      continue;
    }
    if (props.tsdStrokeNull) {
      return undefined;
    }
    if (props.tsdStroke) {
      return strokeToCss(props.tsdStroke);
    }
  }
  return undefined;
}

/** A stroke's CSS `"<width>px <color>"`; undefined when it carries no RGB color. */
function strokeToCss(stroke: StrokeArchive): string | undefined {
  if (!hasRgb(stroke.color)) {
    return undefined;
  }
  const width = Number((stroke.width ?? 1).toFixed(2));
  return `${width}px ${colorToHex(stroke.color)}`;
}
