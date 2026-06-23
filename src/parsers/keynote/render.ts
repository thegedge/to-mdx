import { kebabCase } from "../../utils.ts";
import type { ImageCrop, Paragraph, Presentation, Slide, SlideImage, SvgPath, TableCell, TableData, TextBox, TextBoxGeometry } from "./model.ts";

const INDENT = "  ";

/** Fallback slide size (16:9 at 1080p) when a deck declares none, for the SVG viewBox. */
const DEFAULT_SLIDE_SIZE = { width: 1920, height: 1080 };

/**
 * A JSX attribute that resolves a file against the exported `imageRoot` const,
 * e.g. `src={`${imageRoot}/pic.png`}`. Built by string concatenation so the
 * literal backticks and `${…}` survive into the MDX output.
 */
function rootedAttr(name: string, fileName: string): string {
  return name + "={`${imageRoot}/" + fileName + "`}";
}

function imageSrc(fileName: string): string {
  return rootedAttr("src", fileName);
}

/** Extensions that are images even when carried as a Keynote "movie" (e.g. an animated GIF). */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "gif", "png", "jpg", "jpeg", "webp", "avif", "apng", "heic", "heif", "svg", "bmp", "tiff",
]);

/**
 * True when `name`'s lowercased extension is a known image type. Used to redirect
 * "videos" that are really animated images (a `<video>` tag can't render them) to
 * an `<Image>` instead. A name with no extension is not an image.
 */
export function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * One JSX inline-style entry: a camelCase property and its value. String values
 * are emitted quoted (`"10%"`); number values are emitted bare (`700`), matching
 * how React/JSX style objects accept unitless numerics.
 */
type Declaration = readonly [property: string, value: string | number];

/**
 * Turns ordered style declarations into a JSX `style={{ … }}` attribute string,
 * e.g. `style={{ position: "absolute", left: "10%", fontWeight: 700 }}`. Returns
 * an empty string when there is nothing to emit.
 */
export function styleAttr(declarations: Declaration[]): string {
  if (declarations.length === 0) return "";
  const body = declarations
    .map(([property, value]) => `${property}: ${typeof value === "number" ? value : `"${value}"`}`)
    .join(", ");
  return `style={{ ${body} }}`;
}

/**
 * Makes plain text safe as MDX flow content. The angle brackets `<`/`>` (parsed
 * as JSX tags) and braces `{`/`}` (parsed as JS expressions) are significant;
 * everything else is literal. Do not use on code spans/fences (already literal).
 */
export function escapeMdxText(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

/**
 * Joins the metadata exports and the rendered MDX body with a blank line between
 * them, and a trailing newline. Kept separate so the blank line is asserted in
 * isolation (a template literal here would invite `dedent` to collapse it).
 */
export function assembleMdxDocument(metadataExports: string, content: string): string {
  return `${metadataExports}\n\n${content}\n`;
}

export function presentationToMdx(presentation: Presentation): string {
  const slideSize = presentation.slideSize ?? DEFAULT_SLIDE_SIZE;
  const slides = presentation.slides.map((slide) => renderSlide(slide, slideSize)).join("\n\n");

  // `backgroundRoot={imageRoot}` references the exported `imageRoot` const (a JSX
  // expression), not a string literal.
  const className = kebabCase(presentation.title);

  const wrapper = `<Slides className="${className}" backgroundRoot={imageRoot}>\n${slides}\n</Slides>`;

  // Tables share one scoped stylesheet emitted once for the whole document (and
  // before `<Slides>`, since the scoped selectors still match). HTML `<table>`s
  // depend on it; spanless markdown tables get default styling but it is harmless.
  return hasRenderableTable(presentation) ? `${tableStyleBlock(className)}\n\n${wrapper}` : wrapper;
}

/** Absolute-positioning declarations for a placed image, layered below text. */
function imageDeclarations(box: TextBoxGeometry): Declaration[] {
  return [["position", "absolute"], ...positionRules(box), ["zIndex", 1]];
}

/** A box dimension at or below this percentage is treated as "auto" (Keynote reports 0). */
const SIZE_EPSILON = 0.5;

/**
 * The placement declarations for a box, one axis at a time. Auto-sizing Keynote
 * text boxes report a zero width/height, which would collapse the element and
 * push it off-screen; for those we omit the size and anchor by the near edge
 * (`left`/`top` when the box starts in the first half, otherwise `right`/`bottom`
 * measured from the far edge). When the size is real we keep the start + size as
 * before. Pure and data-driven so absent props are simply not emitted.
 */
export function positionRules(box: TextBoxGeometry): Declaration[] {
  return [
    ...axisRules("left", "right", "width", box.left, box.width),
    ...axisRules("top", "bottom", "height", box.top, box.height),
  ];
}

function axisRules(near: string, far: string, sizeProp: string, start: number, size: number): Declaration[] {
  if (size <= SIZE_EPSILON) {
    return start <= 50 ? [[near, `${percent(start)}%`]] : [[far, `${percent(100 - start)}%`]];
  }
  return [
    [near, `${percent(start)}%`],
    [sizeProp, `${percent(size)}%`],
  ];
}

/** The inline-style declarations for one free text box, in source order, skipping absent properties. */
function boxDeclarations(textBox: Extract<TextBox, { kind: "text" }>): Declaration[] {
  const declarations: Declaration[] = [];

  if (textBox.box) {
    declarations.push(["position", "absolute"]);
    declarations.push(...positionRules(textBox.box));
    // Above positioned images (z-index 1) so text labels stay on top of media.
    declarations.push(["zIndex", 2]);
  }

  const style = textBox.style;
  if (style?.fontFamily) declarations.push(["fontFamily", style.fontFamily]);
  if (style?.fontSizeToken) declarations.push(["fontSize", style.fontSizeToken]);
  if (style?.color) declarations.push(["color", style.color]);
  if (style?.fontWeight !== undefined) declarations.push(["fontWeight", style.fontWeight]);
  if (style?.textAlign) declarations.push(["textAlign", style.textAlign]);

  return declarations;
}

/** Rounds a percentage to two decimals and drops trailing zeros (e.g. 10, 33.33). */
function percent(value: number): number {
  return Number(value.toFixed(2));
}

function renderSlide(slide: Slide, slideSize: { width: number; height: number }): string {
  const attributes = slideAttributes(slide);
  const blocks = slideBlocks(slide, slideSize);
  if (blocks.length === 0) return attributes ? `<Slide ${attributes} />` : "<Slide />";

  const open = attributes ? `<Slide ${attributes}>` : "<Slide>";
  return `${open}\n${indent(blocks.join("\n\n"))}\n</Slide>`;
}

/**
 * The `<Slide>` tag's attributes: the (inferred) layout class, plus a promoted
 * full-bleed `background` rendered `cover` (`opaqueBackground`, no contain). The
 * background attributes are emitted whenever one was promoted, independent of the
 * heuristics gate that governs the class.
 */
function slideAttributes(slide: Slide): string {
  const parts: string[] = [];
  if (slide.className) parts.push(`className="${slide.className}"`);
  if (slide.background) {
    // The `Slide` component prepends `backgroundRoot` (= imageRoot), so this is a
    // bare file name; rooting it here would double the prefix and 404 the image.
    parts.push(`background="${slide.background}"`);
    parts.push("opaqueBackground");
  }
  return parts.join(" ");
}

function slideBlocks(slide: Slide, slideSize: { width: number; height: number }): string[] {
  const blocks: string[] = [];

  if (slide.title) blocks.push(`# ${escapeMdxText(slide.title)}`);
  if (slide.body.length > 0) blocks.push(renderBullets(slide.body));

  if (slide.shapes?.length) blocks.push(renderShapes(slide.shapes, slideSize));

  for (const textBox of slide.textBoxes) {
    blocks.push(renderTextBox(textBox));
  }

  for (const image of slide.images) {
    blocks.push(renderImage(image));
  }

  for (const video of slide.videos) {
    // A "movie" that is really an animated image won't render in a <video> tag.
    blocks.push(
      isImageFile(video)
        ? `<Image ${imageSrc(video)} role="presentation" alt="" />`
        : `<video controls ${imageSrc(video)}></video>`,
    );
  }

  for (const table of slide.tables) {
    blocks.push(renderTable(table));
  }

  if (slide.tableCount > 0) {
    blocks.push(`{/* ${slide.tableCount} table(s) on this slide could not be extracted */}`);
  }

  const notes = renderSpeakerNotes(slide.notes);
  if (notes) blocks.push(notes);

  return blocks.filter((block) => block.length > 0);
}

/** The inline style placing the shape overlay edge-to-edge, below text (z-index 1). */
function shapeOverlayDeclarations(): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", 0],
    ["top", 0],
    ["width", "100%"],
    ["height", "100%"],
    ["overflow", "visible"],
    ["zIndex", 1],
    ["pointerEvents", "none"],
  ];
}

/** The shared arrowhead marker, emitted once per slide when any shape uses an arrow. */
const ARROW_MARKER =
  '<defs><marker id="kn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" ' +
  'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker></defs>';

/**
 * One absolutely-positioned `<svg>` overlay holding the slide's vector shapes as
 * `<path>`s, in baked slide-point coordinates matched by the `viewBox`. Layered
 * below text (z-index 1); arrowheads reference a shared marker emitted once.
 */
function renderShapes(shapes: SvgPath[], slideSize: { width: number; height: number }): string {
  const defs = shapes.some((shape) => shape.markerStart || shape.markerEnd) ? `\n${INDENT}${ARROW_MARKER}` : "";
  const paths = shapes.map((shape) => `${INDENT}${renderPath(shape)}`).join("\n");
  const open = `<svg viewBox="0 0 ${percent(slideSize.width)} ${percent(slideSize.height)}" ${styleAttr(shapeOverlayDeclarations())}>`;
  return `${open}${defs}\n${paths}\n</svg>`;
}

/** A single `<path>` for one vector shape, wiring up any resolved arrowheads. */
function renderPath(shape: SvgPath): string {
  const markers =
    (shape.markerStart ? ' markerStart="url(#kn-arrow)"' : "") + (shape.markerEnd ? ' markerEnd="url(#kn-arrow)"' : "");
  return `<path d="${shape.d}" fill="${shape.fill ?? "none"}" stroke="${shape.stroke}" strokeWidth={${shape.strokeWidth}}${markers} />`;
}

/**
 * An `<Image>` block. A masked image becomes a clipping wrapper showing only the
 * mask's sub-rectangle; otherwise images carrying geometry get an inline `style`
 * placing them absolutely (layered below text), and un-positioned images stay in
 * normal flow.
 */
function renderImage(image: SlideImage): string {
  if (image.crop) return renderCroppedImage(image.fileName, image.altText, image.crop);
  const style = image.box ? `${styleAttr(imageDeclarations(image.box))} ` : "";
  return `<Image ${style}${imageSrc(image.fileName)} role="presentation" alt="${escapeMdxText(image.altText)}" />`;
}

/** The container-rectangle declarations for a masked image's clipping wrapper. */
function cropContainerDeclarations(crop: ImageCrop): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", `${percent(crop.left)}%`],
    ["top", `${percent(crop.top)}%`],
    ["width", `${percent(crop.width)}%`],
    ["height", `${percent(crop.height)}%`],
    ["overflow", "hidden"],
    ["zIndex", 1],
  ];
}

/** The inner-`<img>` declarations placing the full image inside the clipping wrapper. */
function cropImageDeclarations(crop: ImageCrop): Declaration[] {
  return [
    ["position", "absolute"],
    ["left", `${percent(crop.imgLeft)}%`],
    ["top", `${percent(crop.imgTop)}%`],
    ["width", `${percent(crop.imgWidth)}%`],
    ["height", `${percent(crop.imgHeight)}%`],
  ];
}

/**
 * A masked image: an `overflow:"hidden"` container placed on the slide, wrapping
 * the full `<Image>` offset/sized so only the mask's sub-rectangle shows.
 */
function renderCroppedImage(fileName: string, altText: string, crop: ImageCrop): string {
  const container = styleAttr(cropContainerDeclarations(crop));
  const inner = `<Image ${styleAttr(cropImageDeclarations(crop))} ${imageSrc(fileName)} role="presentation" alt="${escapeMdxText(altText)}" />`;
  return `<div ${container}>\n${INDENT}${inner}\n</div>`;
}

function renderSpeakerNotes(notes: Paragraph[]): string {
  if (notes.length === 0) return "";
  return `<SpeakerNotes>\n${indent(renderBullets(notes))}\n</SpeakerNotes>`;
}

function renderBullets(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) => `${INDENT.repeat(Math.max(0, paragraph.depth))}- ${escapeMdxText(paragraph.text)}`)
    .join("\n");
}

function renderTextBox(textBox: TextBox): string {
  if (textBox.kind === "code") {
    return `\`\`\`${textBox.language}\n${textBox.text}\n\`\`\``;
  }
  const prose = textBox.paragraphs.map((paragraph) => escapeMdxText(paragraph.text)).join("\n\n");
  // Positioned/styled boxes get an inline-style div; otherwise the prose stays in
  // normal flow with no wrapper (there is nothing to style).
  const style = styleAttr(boxDeclarations(textBox));
  return style ? `<div ${style}>\n${prose}\n</div>` : prose;
}

/** Whether any slide carries a table with at least one cell (i.e. that renders). */
function hasRenderableTable(presentation: Presentation): boolean {
  return presentation.slides.some((slide) =>
    slide.tables.some((table) => table.rows.some((row) => row.length > 0)),
  );
}

/**
 * The single scoped stylesheet shared by every HTML table in the document,
 * emitted once before `<Slides>`. The selector is scoped to the deck's slug (the
 * same class on `<Slides>`) so the table styling cannot leak, and styles the bare
 * `table`/`th`/`td` elements directly (no per-table class). Multi-line for
 * readability; built by string concatenation so the CSS braces survive inside the
 * JSX expression container.
 */
function tableStyleBlock(slug: string): string {
  const scope = `.slides.${slug}`;
  const css = [
    `${scope} table {`,
    `  border-collapse: collapse;`,
    `}`,
    `${scope} th,`,
    `${scope} td {`,
    `  border: 1px solid currentColor;`,
    `  padding: 0.25em;`,
    `}`,
  ].join("\n");
  return "<style>{`\n" + css + "\n`}</style>";
}

/**
 * Renders an extracted table. A table whose cells never span (every cell is
 * 1×1) becomes a GitHub-flavored markdown table (the first row is the header);
 * GFM cannot express col/row spans, so any spanning cell forces the HTML
 * `<table>` form instead. A table with no cells renders nothing.
 */
export function renderTable(table: TableData): string {
  if (table.rows.every((row) => row.length === 0)) return "";
  return isSpanless(table) ? renderMarkdownTable(table) : renderHtmlTable(table);
}

/** True when no cell in the table spans more than one column or row. */
function isSpanless(table: TableData): boolean {
  return table.rows.every((row) => row.every((cell) => cell.colSpan === 1 && cell.rowSpan === 1));
}

/**
 * Renders a spanless table as a GFM markdown table: the first non-empty row is
 * the header, followed by a `| --- |` separator and the body rows. Rows are
 * padded to the widest row so the pipe columns line up.
 */
function renderMarkdownTable(table: TableData): string {
  const rows = table.rows.filter((row) => row.length > 0);
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: TableCell[]): string => {
    const cells = row.map((cell) => markdownCell(cell.text));
    while (cells.length < width) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  const separator = `| ${Array(width).fill("---").join(" | ")} |`;
  const [header, ...body] = rows;
  return [line(header), separator, ...body.map(line)].join("\n");
}

/** Escapes a markdown cell: MDX-escaped, `|` escaped as `\|`, newlines as `<br>`. */
function markdownCell(text: string): string {
  return escapeMdxText(text).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/**
 * Renders a spanning table as raw HTML (`<table>`/`<tr>`/`<td>`), which MDX
 * passes through. Only anchor cells are emitted; merges become `colSpan`/`rowSpan`
 * attributes (omitted when 1). Cell text is MDX-escaped and intra-cell newlines
 * become `<br/>`. Borders come from the shared scoped `table` rule, so the
 * element carries no class and cells carry no inline style.
 */
function renderHtmlTable(table: TableData): string {
  const body = table.rows
    .map((row) => `${INDENT}<tr>${row.map(renderCell).join("")}</tr>`)
    .join("\n");
  return `<table>\n${body}\n</table>`;
}

/** A single `<td>` with span attributes (omitted when 1) and escaped text. */
function renderCell(cell: TableCell): string {
  let attrs = "";
  if (cell.colSpan > 1) attrs += ` colSpan={${cell.colSpan}}`;
  if (cell.rowSpan > 1) attrs += ` rowSpan={${cell.rowSpan}}`;
  return `<td${attrs}>${cellHtml(cell.text)}</td>`;
}

/** Escapes a cell's text for MDX flow content, rendering newlines as line breaks. */
function cellHtml(text: string): string {
  return escapeMdxText(text).replace(/\n/g, "<br/>");
}

/** Indents every non-blank line by two spaces (slide content sits inside `<Slide>`). */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join("\n");
}
