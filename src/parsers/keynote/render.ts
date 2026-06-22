import { kebabCase } from "../../utils.ts";
import type { Paragraph, Presentation, Slide, TextBox } from "./model.ts";

const INDENT = "  ";

/**
 * A JSX `src` attribute value that resolves the file against the exported
 * `imageRoot` const, e.g. `src={`${imageRoot}/pic.png`}`. Built by string
 * concatenation so the literal backticks and `${…}` survive into the MDX output.
 */
function imageSrc(fileName: string): string {
  return "src={`${imageRoot}/" + fileName + "`}";
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
  const slides = presentation.slides.map((slide) => renderSlide(slide)).join("\n\n");

  // `backgroundRoot={imageRoot}` references the exported `imageRoot` const (a JSX
  // expression), not a string literal.
  const className = kebabCase(presentation.title);
  let output = `<Slides className="${className}" backgroundRoot={imageRoot}>\n${slides}\n</Slides>`;

  // Positioning/styling for free text boxes is a generated stylesheet that sits
  // before the deck wrapper (scoped to its slug), so it applies to every slide.
  const styleBlock = renderStyleBlock(presentation, className);
  if (styleBlock) output = `${styleBlock}\n\n${output}`;

  // The unplaced-images section is not a slide, so it sits after the wrapper.
  const appendix = renderUnplacedImages(presentation.unplacedImages);
  if (appendix) output += `\n\n${appendix}`;

  return output;
}

/**
 * A scoped `<style>` block placing/styling free text boxes by slide order and
 * box index (`.kn-box-M`). Emits only the properties that were extracted, one
 * rule per box that has any, and nothing at all when no box is styled.
 */
function renderStyleBlock(presentation: Presentation, slug: string): string {
  const rules: string[] = [];

  presentation.slides.forEach((slide, slideIndex) => {
    slide.textBoxes.forEach((textBox, boxIndex) => {
      if (textBox.kind !== "text") return;
      const declarations = boxDeclarations(textBox);
      if (declarations.length === 0) return;

      const selector = `.slides.${slug} .slide[data-slide-number="${slideIndex + 1}"] .kn-box-${boxIndex}`;
      const body = declarations.map((declaration) => `    ${declaration}`).join("\n");
      rules.push(`  ${selector} {\n${body}\n  }`);
    });
  });

  if (rules.length === 0) return "";
  return `<style>{\`\n${rules.join("\n\n")}\n\`}</style>`;
}

/** The CSS declarations for one free text box, in source order, skipping absent properties. */
function boxDeclarations(textBox: Extract<TextBox, { kind: "text" }>): string[] {
  const declarations: string[] = [];

  if (textBox.box) {
    declarations.push("position: absolute;");
    declarations.push(`left: ${percent(textBox.box.left)}%;`);
    declarations.push(`top: ${percent(textBox.box.top)}%;`);
    declarations.push(`width: ${percent(textBox.box.width)}%;`);
    declarations.push(`height: ${percent(textBox.box.height)}%;`);
  }

  const style = textBox.style;
  if (style?.fontSizeToken) declarations.push(`font-size: ${style.fontSizeToken};`);
  if (style?.color) declarations.push(`color: ${style.color};`);
  if (style?.fontWeight !== undefined) declarations.push(`font-weight: ${style.fontWeight};`);
  if (style?.textAlign) declarations.push(`text-align: ${style.textAlign};`);

  return declarations;
}

/** Rounds a percentage to two decimals and drops trailing zeros (e.g. 10, 33.33). */
function percent(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Trailing section for images that resolved to a file but could not be linked to
 * any slide (their container was lost to a partially decoded chunk). Emitted so
 * the content is preserved in the doc for manual placement.
 */
function renderUnplacedImages(fileNames: string[]): string {
  if (fileNames.length === 0) return "";

  const blocks = [
    "{/* Unplaced images: these could not be linked to a slide (container lost to a partially-decoded chunk) */}",
    ...fileNames.map((fileName) => `<Image ${imageSrc(fileName)} role="presentation" alt="" />`),
  ];
  return blocks.join("\n\n");
}

function renderSlide(slide: Slide): string {
  const blocks = slideBlocks(slide);
  if (blocks.length === 0) return "<Slide />";

  const open = slide.className ? `<Slide className="${slide.className}">` : "<Slide>";
  return `${open}\n${indent(blocks.join("\n\n"))}\n</Slide>`;
}

function slideBlocks(slide: Slide): string[] {
  const blocks: string[] = [];

  if (slide.title) blocks.push(`# ${escapeMdxText(slide.title)}`);
  if (slide.body.length > 0) blocks.push(renderBullets(slide.body));

  slide.textBoxes.forEach((textBox, index) => {
    blocks.push(renderTextBox(textBox, index));
  });

  for (const image of slide.images) {
    blocks.push(`<Image ${imageSrc(image.fileName)} role="presentation" alt="${escapeMdxText(image.altText)}" />`);
  }

  for (const video of slide.videos) {
    blocks.push(`<video controls ${imageSrc(video)}></video>`);
  }

  if (slide.tableCount > 0) {
    blocks.push(`{/* ${slide.tableCount} table(s) on this slide were not extracted */}`);
  }

  const notes = renderSpeakerNotes(slide.notes);
  if (notes) blocks.push(notes);

  return blocks.filter((block) => block.length > 0);
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

function renderTextBox(textBox: TextBox, index: number): string {
  if (textBox.kind === "code") {
    return `\`\`\`${textBox.language}\n${textBox.text}\n\`\`\``;
  }
  // Wrapped in a `.kn-box-N` div so the generated stylesheet can position/style it.
  const prose = textBox.paragraphs.map((paragraph) => escapeMdxText(paragraph.text)).join("\n\n");
  return `<div className="kn-box-${index}">\n${prose}\n</div>`;
}

/** Indents every non-blank line by two spaces (slide content sits inside `<Slide>`). */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join("\n");
}
