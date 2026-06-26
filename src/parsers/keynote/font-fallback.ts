/** A generic CSS font fallback guessed from the font's name, so a missing font degrades to a sensible family. */

/** Keyword → generic family, in priority order (first match wins). */
const FALLBACKS: ReadonlyArray<{ test: RegExp; family: string }> = [
  { test: /mono|code|consol|courier|menlo/, family: "monospace" },
  { test: /sans|grotesk|gothic|helvetica|arial/, family: "sans-serif" },
  { test: /serif/, family: "serif" },
  { test: /script|cursive|brush|hand|comic/, family: "cursive" },
];

/** The generic CSS family (`monospace`/`serif`/…) to fall back to for `name`; defaults to `sans-serif`. */
export function genericFallback(name: string): string {
  const lower = name.toLowerCase();
  return FALLBACKS.find((entry) => entry.test.test(lower))?.family ?? "sans-serif";
}

/** A `font-family` value: the named font quoted, plus its generic fallback (`"Fira Code", monospace`). */
export function fontFamilyValue(name: string): string {
  return `"${name}", ${genericFallback(name)}`;
}
