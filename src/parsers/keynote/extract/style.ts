import type { TextBoxGeometry, TextBoxStyle } from "../model.ts";
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
];

/** Maps a point size to the `var(--text-*)` token nearest it (capped at the ends of the scale). */
export function fontSizeToken(pt: number): string {
  let best = FONT_SIZE_TOKENS[0];
  for (const candidate of FONT_SIZE_TOKENS) {
    if (Math.abs(candidate.px - pt) < Math.abs(best.px - pt)) best = candidate;
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
 * Lifts the dominant visual style from a text box's storage: font size, color,
 * weight, and alignment from the first paragraph style, with a color override
 * from the first character style (where Keynote keeps run-level color). This is a
 * first-pass read of the first paragraph/run — no full style inheritance — so any
 * property the archive omits is dropped, and an empty result returns undefined.
 */
export function textBoxStyle(storage: StorageArchive | undefined, registry: Registry): TextBoxStyle | undefined {
  if (!storage) return undefined;

  const paraStyle = registry.resolve<ParagraphStyleArchive>(storage.tableParaStyle?.entries[0]?.object);
  const charStyle = registry.resolve<CharacterStyleArchive>(storage.tableCharStyle?.entries[0]?.object);

  const charProps = paraStyle?.charProperties;
  const fontColor = charStyle?.charProperties?.fontColor ?? charProps?.fontColor;

  const style: TextBoxStyle = {};
  if (charProps?.fontSize !== undefined) style.fontSizeToken = fontSizeToken(charProps.fontSize);
  if (hasRgb(fontColor)) style.color = colorToHex(fontColor);
  if (charProps?.bold) style.fontWeight = 700;
  const align = alignmentToken(paraStyle?.paraProperties?.alignment);
  if (align) style.textAlign = align;

  return Object.keys(style).length > 0 ? style : undefined;
}

function hasRgb(color: Color | undefined): color is Color {
  return !!color && (color.r !== undefined || color.g !== undefined || color.b !== undefined);
}
