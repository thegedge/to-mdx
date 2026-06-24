import { kebabCase } from "../../utils.ts";

/**
 * A CSS color literal as it appears in the generated MDX: a 3/6/8-digit `#hex`
 * or an `rgb()`/`rgba()` functional value (the latter carrying internal commas).
 */
const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)/g;

/**
 * One opening JSX/HTML tag in the rendered slides: the tag name, its raw
 * attribute text (no `>` ever appears inside, since string/expression values are
 * brace- or quote-delimited), and an optional self-closing slash. Closing tags
 * (`</div>`) start with `/` and never match.
 */
const TAG_RE = /<([A-Za-z][A-Za-z0-9]*)([^>]*?)(\/?)>/g;

/** Matches a single `style={{ … }}` attribute and captures its declaration body. */
const STYLE_RE = /style=\{\{ ([^}]*) \}\}/;

/** Matches a `className="…"` attribute and captures the class list. */
const CLASS_RE = /className="([^"]*)"/;

/** One JSX inline-style declaration: a camelCase property and its raw value token. */
interface StyleDecl {
  property: string;
  /** The raw value as written: a quoted string (`"10%"`) or a bare number (`700`). */
  value: string;
}

/**
 * Parses a JSX style body (`position: "absolute", zIndex: 700`) into ordered
 * declarations. Quoted values are taken whole (so an `rgba(…)`'s internal commas
 * don't split a declaration); bare values run to the next comma.
 */
export function parseStyleDeclarations(body: string): StyleDecl[] {
  const declarations: StyleDecl[] = [];
  for (const match of body.matchAll(/(\w+): ("[^"]*"|[^,]+)/g)) {
    declarations.push({ property: match[1], value: match[2].trim() });
  }
  return declarations;
}

/** Converts a camelCase JSX style property to its kebab-case CSS form (`zIndex` → `z-index`). */
function cssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** Unwraps a JSX style value to its CSS form: strips the quotes off a string, leaves a number bare. */
function cssValue(value: string): string {
  return value.startsWith('"') ? value.slice(1, -1) : value;
}

/**
 * Renders a parsed style body as the indented CSS declaration block used inside a
 * scoped class rule (e.g. `  background-color: var(--palette1);`).
 */
export function styleBodyToCss(body: string): string {
  return parseStyleDeclarations(body)
    .map(({ property, value }) => `  ${cssProperty(property)}: ${cssValue(value)};`)
    .join("\n");
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
 * scoped stylesheet, leaving the rendered result visually identical:
 *
 * 1. Every color (in `style` values and SVG `fill`/`stroke`) used 2+ times becomes
 *    a `--paletteN` custom property on `scope`, referenced via `var(--paletteN)`
 *    (which inherits into both inline styles and SVG attributes).
 * 2. The most common `fontFamily` becomes the `scope` default and every inline
 *    `fontFamily` is removed; rarer families get a `.font-…` utility class.
 * 3. Any identical full inline-style set (post color/font hoisting) used 2+ times
 *    on intrinsic elements becomes a `.styleN` class.
 */
export function hoistStyles(wrapper: string, scope: string): HoistResult {
  const colorCounts = new Map<string, number>();
  const colorOrder: string[] = [];
  const fontCounts = new Map<string, number>();
  const fontOrder: string[] = [];

  for (const [, , attrs] of wrapper.matchAll(TAG_RE)) {
    const style = STYLE_RE.exec(attrs);
    if (style) {
      for (const color of style[1].matchAll(COLOR_RE)) {
        tally(color[0], colorCounts, colorOrder);
      }
      const font = /fontFamily: "([^"]*)"/.exec(style[1]);
      if (font) {
        tally(font[1], fontCounts, fontOrder);
      }
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

  const subColors = (text: string): string =>
    text.replace(COLOR_RE, (color) => {
      const name = colorVars.get(color);
      return name ? `var(${name})` : color;
    });
  const stripFont = (body: string): { body: string; family?: string } => {
    const match = /fontFamily: "([^"]*)"/.exec(body);
    if (!match) {
      return { body };
    }
    const stripped = body
      .replace(/fontFamily: "[^"]*", /, "")
      .replace(/, fontFamily: "[^"]*"/, "")
      .replace(/fontFamily: "[^"]*"/, "");
    return { body: stripped, family: match[1] };
  };
  const hoistedBody = (body: string): string => stripFont(subColors(body)).body;

  const setCounts = new Map<string, number>();
  const setOrder: string[] = [];
  for (const [, name, attrs] of wrapper.matchAll(TAG_RE)) {
    if (!isIntrinsic(name)) {
      continue;
    }
    const style = STYLE_RE.exec(attrs);
    if (!style) {
      continue;
    }
    const body = hoistedBody(style[1]);
    if (body.trim() !== "") {
      tally(body, setCounts, setOrder);
    }
  }
  const setClasses = new Map<string, string>();
  for (const body of setOrder) {
    if ((setCounts.get(body) ?? 0) >= 2) {
      setClasses.set(body, `style${setClasses.size + 1}`);
    }
  }

  const newWrapper = wrapper.replace(TAG_RE, (_full, name: string, attrs: string, slash: string) => {
    const intrinsic = isIntrinsic(name);
    let rewritten = attrs;

    const addClasses: string[] = [];
    const style = STYLE_RE.exec(rewritten);
    if (style) {
      let body = subColors(style[1]);
      if (intrinsic) {
        const stripped = stripFont(body);
        body = stripped.body;
        if (stripped.family && stripped.family !== defaultFont) {
          const fontClass = fontClasses.get(stripped.family);
          if (fontClass) {
            addClasses.push(fontClass);
          }
        }
      }
      const trimmed = body.trim();
      const setClass = intrinsic && trimmed !== "" ? setClasses.get(body) : undefined;
      if (setClass) {
        addClasses.push(setClass);
        rewritten = rewritten.replace(/ ?style=\{\{ [^}]*\}\}/, "");
      } else if (trimmed === "") {
        rewritten = rewritten.replace(/ ?style=\{\{ [^}]*\}\}/, "");
      } else {
        rewritten = rewritten.replace(STYLE_RE, `style={{ ${body} }}`);
      }
    }

    if (addClasses.length > 0) {
      const existing = CLASS_RE.exec(rewritten);
      if (existing) {
        const merged = [existing[1], ...addClasses].join(" ");
        rewritten = rewritten.replace(CLASS_RE, `className="${merged}"`);
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
    rules.push(`${scope} .${setClass} {\n${styleBodyToCss(body)}\n}`);
  }

  return { wrapper: newWrapper, rules };
}
