import { kebabCase } from "../../utils.ts";

/**
 * One JSX inline-style entry: a camelCase property and its value. String values
 * are emitted quoted (`"10%"`); number values are emitted bare (`700`), matching
 * how React/JSX style objects accept unitless numerics. This is the single
 * structured source of truth a renderer hands to {@link hoistStyles} — the style
 * is never recovered by regex-parsing emitted JSX.
 */
export type Declaration = readonly [property: string, value: string | number];

/** The control character framing a style placeholder token (`\0<id>\0`) in the rendered markup. */
const MARK = "\u0000";

/**
 * Collects the structured `Declaration[]` behind every `style={{ … }}` a render
 * emits, handing back an opaque placeholder token to splice into the markup in
 * the style attribute's place. After rendering, {@link hoistStyles} reads the
 * declarations back out by token — so colour/font/style-set hoisting works on the
 * structured data, not on a regex parse of the renderer's own output.
 */
export class StyleCollector {
  readonly #entries: Declaration[][] = [];

  /** Registers a style's declarations and returns the placeholder token that stands in for it. */
  add(declarations: Declaration[]): string {
    const id = this.#entries.length;
    this.#entries.push(declarations);
    return `${MARK}${id}${MARK}`;
  }

  /** The declarations registered for a placeholder token's id (empty for an unknown id). */
  declarations(id: number): Declaration[] {
    return this.#entries[id] ?? [];
  }
}

/**
 * Serialises declarations into a JSX `style={{ … }}` body, e.g.
 * `position: "absolute", left: "10%", fontWeight: 700`. The single source of the
 * inline-style spelling, shared by the renderer's `styleAttr` and the hoister's
 * re-emission so the two can never drift.
 */
export function declarationBody(declarations: readonly Declaration[]): string {
  return declarations
    .map(([property, value]) => `${property}: ${typeof value === "number" ? value : `"${value}"`}`)
    .join(", ");
}

/**
 * A CSS color literal as it appears in a style value: a 3/6/8-digit `#hex` or an
 * `rgb()`/`rgba()` functional value (the latter carrying internal commas). Only
 * ever run over a single declaration's value, never a whole style body.
 */
const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)/g;

/**
 * One opening JSX/HTML tag: the tag name, its raw attribute text, and an optional
 * self-closing slash. Used only to locate elements and place class names — the
 * style itself is a brace-free placeholder token, so no style body is ever parsed.
 */
const TAG_RE = /<([A-Za-z][A-Za-z0-9]*)([^>]*?)(\/?)>/g;

/** A style placeholder token (`\0<id>\0`); the capture is the collector entry id. */
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/;

/** A style placeholder token, scanning every occurrence in document order. */
const PLACEHOLDER_GLOBAL_RE = /\u0000(\d+)\u0000/g;

/** A style placeholder with an optional single leading space, removed when the style is dropped. */
const PLACEHOLDER_LEAD_RE = / ?\u0000\d+\u0000/;

/** Matches a `className="…"` attribute and captures the class list. */
const CLASS_RE = /className="([^"]*)"/;

/** Converts a camelCase JSX style property to its kebab-case CSS form (`zIndex` → `z-index`). */
function cssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Renders declarations as the indented CSS block used inside a scoped class rule
 * (e.g. `  background-color: var(--palette1);`). Values are already CSS-ready
 * (numbers bare, strings unquoted, `var()` literal).
 */
function declarationsToCss(declarations: readonly Declaration[]): string {
  return declarations.map(([property, value]) => `  ${cssProperty(property)}: ${value};`).join("\n");
}

/** The class name for a non-default font family: `font-<kebab>`, or `font<n>` when the family has no usable slug. */
function fontClassName(family: string, ordinal: number): string {
  const slug = kebabCase(family);
  return slug ? `font-${slug}` : `font${ordinal}`;
}

/** Tallies a value into a count map while recording first-seen order in `order`. */
function tally(value: string, counts: Map<string, number>, order: string[]): void {
  if (!counts.has(value)) {
    order.push(value);
  }
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

/** Whether a tag name is an intrinsic HTML/SVG element (lowercase first letter), not a React component. */
function isIntrinsic(name: string): boolean {
  return name[0] === name[0].toLowerCase();
}

/**
 * Per-element geometry kept inline (never classed) — positioning plus `transform`
 * (rotation/translate) — so elements differing only in placement or angle still
 * share one class for the rest of their style.
 */
const POSITION_KEYS: ReadonlySet<string> = new Set(["left", "top", "right", "bottom", "transform"]);

/** Splits declarations into the inline-only positioning subset and the class-eligible rest. */
function partitionPosition(declarations: readonly Declaration[]): { position: Declaration[]; rest: Declaration[] } {
  const position: Declaration[] = [];
  const rest: Declaration[] = [];
  for (const declaration of declarations) {
    (POSITION_KEYS.has(declaration[0]) ? position : rest).push(declaration);
  }
  return { position, rest };
}

/** The element's `fontFamily` family, or undefined when it declares none. */
function fontFamilyOf(declarations: readonly Declaration[]): string | undefined {
  const declaration = declarations.find(([property]) => property === "fontFamily");
  return declaration === undefined ? undefined : String(declaration[1]);
}

/** Every CSS color literal in a single declaration value, in order (non-strings carry none). */
function valueColors(value: string | number): string[] {
  return typeof value === "string" ? [...value.matchAll(COLOR_RE)].map((match) => match[0]) : [];
}

/** Rewrites a declaration value, swapping any hoisted color for its `var(--paletteN)` reference. */
function substituteColors(value: string | number, colorVars: Map<string, string>): string | number {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(COLOR_RE, (color) => {
    const name = colorVars.get(color);
    return name ? `var(${name})` : color;
  });
}

/** The placeholder id carried by a tag's attributes, or undefined when the element has no style. */
function placeholderId(attrs: string): number | undefined {
  const match = PLACEHOLDER_RE.exec(attrs);
  return match ? Number(match[1]) : undefined;
}

/**
 * The result of hoisting: the rewritten slides markup and the ordered CSS rule
 * blocks (custom-property/default-font scope first, then font classes, then style
 * classes) to merge into the document's scoped `<style>`.
 */
export interface HoistResult {
  wrapper: string;
  rules: string[];
}

/**
 * Lifts repeated inline styling out of the rendered `<Slides>` markup into the
 * scoped stylesheet, leaving the rendered result visually identical. The styles
 * are read structurally from `collector` (each element carries a placeholder
 * token in place of its `style={{ … }}`), never by parsing the emitted JSX:
 *
 * 1. Every color (in any declaration value, including SVG `fill`/`stroke`) used 2+
 *    times becomes a `--paletteN` custom property on `scope`, referenced via
 *    `var(--paletteN)` (which inherits into both inline styles and SVG attributes).
 * 2. The most common `fontFamily` becomes the `scope` default and every inline
 *    `fontFamily` is removed; rarer families get a `.font-…` utility class.
 * 3. An intrinsic element's class-eligible style set — everything but `left`/`top`/
 *    `right`/`bottom`, which stay inline — becomes a `.styleN` class when used 2+
 *    times, so elements differing only in placement share one class.
 */
export function hoistStyles(wrapper: string, scope: string, collector: StyleCollector): HoistResult {
  // Color/font tally, in document order, straight from each placeholder's declarations.
  const colorCounts = new Map<string, number>();
  const colorOrder: string[] = [];
  const fontCounts = new Map<string, number>();
  const fontOrder: string[] = [];
  for (const [, id] of wrapper.matchAll(PLACEHOLDER_GLOBAL_RE)) {
    const declarations = collector.declarations(Number(id));
    for (const [, value] of declarations) {
      for (const color of valueColors(value)) {
        tally(color, colorCounts, colorOrder);
      }
    }
    const family = fontFamilyOf(declarations);
    if (family !== undefined) {
      tally(family, fontCounts, fontOrder);
    }
  }

  const colorVars = new Map<string, string>();
  for (const color of colorOrder) {
    if ((colorCounts.get(color) ?? 0) >= 2) {
      colorVars.set(color, `--palette${colorVars.size + 1}`);
    }
  }

  let defaultFont: string | undefined;
  for (const family of fontOrder) {
    if (defaultFont === undefined || (fontCounts.get(family) ?? 0) > (fontCounts.get(defaultFont) ?? 0)) {
      defaultFont = family;
    }
  }
  const fontClasses = new Map<string, string>();
  for (const family of fontOrder) {
    if (family !== defaultFont) {
      fontClasses.set(family, fontClassName(family, fontClasses.size + 1));
    }
  }

  // An element's declarations after color hoisting, with `fontFamily` dropped for
  // intrinsic elements (the family rides the scope default or a `.font-…` class).
  const hoistedDeclarations = (declarations: readonly Declaration[], intrinsic: boolean): Declaration[] => {
    const substituted = declarations.map<Declaration>(([property, value]) => [property, substituteColors(value, colorVars)]);
    return intrinsic ? substituted.filter(([property]) => property !== "fontFamily") : substituted;
  };

  // Tally each intrinsic element's class-eligible style set — everything but the
  // inline-only positioning — keyed by its body, so two elements that differ only
  // in placement share one class.
  const setCounts = new Map<string, number>();
  const setOrder: string[] = [];
  const setDeclarations = new Map<string, Declaration[]>();
  for (const [, name, attrs] of wrapper.matchAll(TAG_RE)) {
    if (!isIntrinsic(name)) {
      continue;
    }
    const id = placeholderId(attrs);
    if (id === undefined) {
      continue;
    }
    const { rest } = partitionPosition(hoistedDeclarations(collector.declarations(id), true));
    const body = declarationBody(rest);
    if (body !== "") {
      if (!setDeclarations.has(body)) {
        setDeclarations.set(body, rest);
      }
      tally(body, setCounts, setOrder);
    }
  }
  const setClasses = new Map<string, string>();
  for (const body of setOrder) {
    if ((setCounts.get(body) ?? 0) >= 2) {
      setClasses.set(body, `style${setClasses.size + 1}`);
    }
  }

  const newWrapper = wrapper.replace(TAG_RE, (full, name: string, attrs: string, slash: string) => {
    const id = placeholderId(attrs);
    if (id === undefined) {
      return full;
    }
    const intrinsic = isIntrinsic(name);
    const declarations = collector.declarations(id);
    let rewritten = attrs;
    const addClasses: string[] = [];

    if (intrinsic) {
      const family = fontFamilyOf(declarations);
      if (family !== undefined && family !== defaultFont) {
        const fontClass = fontClasses.get(family);
        if (fontClass) {
          addClasses.push(fontClass);
        }
      }
    }

    const hoisted = hoistedDeclarations(declarations, intrinsic);
    const { position, rest } = intrinsic ? partitionPosition(hoisted) : { position: [] as Declaration[], rest: hoisted };
    const restBody = declarationBody(rest);
    const setClass = intrinsic && restBody !== "" ? setClasses.get(restBody) : undefined;

    if (setClass) {
      // The class carries everything but positioning, which stays inline.
      addClasses.push(setClass);
      const positionBody = declarationBody(position);
      rewritten = positionBody === ""
        ? rewritten.replace(PLACEHOLDER_LEAD_RE, "")
        : rewritten.replace(PLACEHOLDER_RE, `style={{ ${positionBody} }}`);
    } else {
      const fullBody = declarationBody(hoisted);
      rewritten = fullBody === ""
        ? rewritten.replace(PLACEHOLDER_LEAD_RE, "")
        : rewritten.replace(PLACEHOLDER_RE, `style={{ ${fullBody} }}`);
    }

    if (addClasses.length > 0) {
      const existing = CLASS_RE.exec(rewritten);
      if (existing) {
        rewritten = rewritten.replace(CLASS_RE, `className="${[existing[1], ...addClasses].join(" ")}"`);
      } else {
        rewritten = ` className="${addClasses.join(" ")}"${rewritten}`;
      }
    }

    return `<${name}${rewritten}${slash}>`;
  });

  const rules: string[] = [];
  const scopedLines: string[] = [];
  for (const [color, name] of colorVars) {
    scopedLines.push(`  ${name}: ${color};`);
  }
  if (defaultFont) {
    scopedLines.push(`  font-family: "${defaultFont}";`);
  }
  if (scopedLines.length > 0) {
    rules.push(`${scope} {\n${scopedLines.join("\n")}\n}`);
  }
  for (const [family, fontClass] of fontClasses) {
    rules.push(`${scope} .${fontClass} {\n  font-family: "${family}";\n}`);
  }
  for (const [body, setClass] of setClasses) {
    rules.push(`${scope} .${setClass} {\n${declarationsToCss(setDeclarations.get(body) ?? [])}\n}`);
  }

  return { wrapper: newWrapper, rules };
}
