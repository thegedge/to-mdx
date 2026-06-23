import type { ImageCrop, TextBoxGeometry, TextBoxStyle } from "../model.ts";
import type { Registry } from "../registry.ts";
import type {
  CharacterStyleArchive,
  Color,
  ParagraphStyleArchive,
  StorageArchive,
} from "../types.ts";
import type { RawBox } from "./layout.ts";

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
 * Reference height (px) that a font's *fraction of the slide height* is scaled
 * against before picking a token. Keynote point sizes are absolute to the deck's
 * (large) canvas, so a raw 36pt body line maps to a huge token; instead we treat
 * the font as a fraction of slide height and render it as if the slide were this
 * many px tall. Tuned on the reference deck (1920×1080): typical body text (~36pt)
 * lands on `--text-lg`, titles climb to `--text-4xl`, and a giant 200pt emoji tops
 * out around `--text-8xl` rather than `--text-9xl`.
 */
const SLIDE_FONT_REFERENCE_PX = 512;

/**
 * Maps a Keynote point size to the `var(--text-*)` token nearest it (capped at the
 * ends of the scale). When a slide height is supplied the size is first rescaled by
 * its fraction of the slide height (see `SLIDE_FONT_REFERENCE_PX`), so a font's
 * token reflects how large it reads on the slide rather than its raw point value; a
 * missing/degenerate slide height falls back to the raw point size.
 */
export function fontSizeToken(pt: number, slideHeightPt?: number): string {
  const px = slideHeightPt && slideHeightPt > 0 ? (pt / slideHeightPt) * SLIDE_FONT_REFERENCE_PX : pt;
  let best = FONT_SIZE_TOKENS[0];
  for (const candidate of FONT_SIZE_TOKENS) {
    if (Math.abs(candidate.px - px) < Math.abs(best.px - px)) best = candidate;
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

/**
 * Maps a PostScript-ish font name to a usable CSS family: drops a trailing
 * weight/style suffix after the last `-` (e.g. `ShopifySans-Light` → `ShopifySans`,
 * `Helvetica-Bold` → `Helvetica`), then splits a camelCase family into words
 * (`ShopifySans` → `Shopify Sans`). `Impact` stays `Impact`. Blank names yield
 * undefined. (We can't recover the registered display name, so this is a best
 * effort at a human-readable family.)
 */
export function fontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const dash = name.lastIndexOf("-");
  const base = (dash > 0 ? name.slice(0, dash) : name).trim();
  if (!base) return undefined;
  return base.replace(/([a-z])([A-Z])/g, "$1 $2");
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

/** Converts a drawable's point-space bounding box to slide-size percentages. */
export function boxPercent(
  box: RawBox | undefined,
  slideSize: { width: number; height: number },
): TextBoxGeometry | undefined {
  if (!box || slideSize.width <= 0 || slideSize.height <= 0) return undefined;
  return {
    left: (box.x / slideSize.width) * 100,
    top: (box.y / slideSize.height) * 100,
    width: (box.width / slideSize.width) * 100,
    height: (box.height / slideSize.height) * 100,
  };
}

/**
 * Crop geometry for a masked image. The mask frame `(mx,my,mw,mh)` is in the
 * image's local space (mask.parent = image), so the visible region on the slide
 * is `(x+mx, y+my, mw, mh)` showing the full image clipped to it. The container
 * is expressed in slide-size percentages; the inner `<img>` is sized/offset in
 * percentages of the container. Returns undefined when the slide or mask is
 * degenerate (zero-sized), so callers fall back to the plain image box.
 */
export function maskCrop(
  image: RawBox,
  mask: RawBox,
  slideSize: { width: number; height: number },
): ImageCrop | undefined {
  if (slideSize.width <= 0 || slideSize.height <= 0 || mask.width <= 0 || mask.height <= 0) return undefined;
  return {
    left: ((image.x + mask.x) / slideSize.width) * 100,
    top: ((image.y + mask.y) / slideSize.height) * 100,
    width: (mask.width / slideSize.width) * 100,
    height: (mask.height / slideSize.height) * 100,
    imgLeft: (-mask.x / mask.width) * 100,
    imgTop: (-mask.y / mask.height) * 100,
    imgWidth: (image.width / mask.width) * 100,
    imgHeight: (image.height / mask.height) * 100,
  };
}

/**
 * Lifts the dominant visual style from a text box's storage: font size, color,
 * weight, and alignment from the first paragraph style, with a color override
 * from the first character style (where Keynote keeps run-level color). This is a
 * first-pass read of the first paragraph/run — no full style inheritance — so any
 * property the archive omits is dropped, and an empty result returns undefined.
 */
export function textBoxStyle(
  storage: StorageArchive | undefined,
  registry: Registry,
  slideHeightPt?: number,
): TextBoxStyle | undefined {
  if (!storage) return undefined;

  const paraStyle = registry.resolve<ParagraphStyleArchive>(storage.tableParaStyle?.entries[0]?.object);
  const charStyle = registry.resolve<CharacterStyleArchive>(storage.tableCharStyle?.entries[0]?.object);

  const charProps = paraStyle?.charProperties;
  const fontColor = charStyle?.charProperties?.fontColor ?? charProps?.fontColor;
  const family = fontFamily(charStyle?.charProperties?.fontName ?? charProps?.fontName);

  const style: TextBoxStyle = {};
  if (charProps?.fontSize !== undefined) style.fontSizeToken = fontSizeToken(charProps.fontSize, slideHeightPt);
  if (family) style.fontFamily = family;
  if (hasRgb(fontColor)) style.color = colorToHex(fontColor);
  if (charProps?.bold) style.fontWeight = 700;
  const align = alignmentToken(paraStyle?.paraProperties?.alignment);
  if (align) style.textAlign = align;

  return Object.keys(style).length > 0 ? style : undefined;
}

function hasRgb(color: Color | undefined): color is Color {
  return !!color && (color.r !== undefined || color.g !== undefined || color.b !== undefined);
}
