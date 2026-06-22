import type { Paragraph, Presentation, Slide, TextBox } from "./model.ts";

const INDENT = "  ";

/**
 * Makes plain text safe as MDX flow content. Only `<` (parsed as a JSX tag) and
 * `{` (parsed as a JS expression) are significant; everything else is literal.
 * Do not use on code spans/fences (which are already literal in MDX).
 */
export function escapeMdxText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/\{/g, "&#123;");
}

export function presentationToMdx(presentation: Presentation, basename: string): string {
  const slides = presentation.slides.map((slide) => renderSlide(slide, basename)).join("\n");

  let output = `<Slides>\n${slides}\n</Slides>`;

  // The unplaced-images section is not a slide, so it sits after the wrapper.
  const appendix = renderUnplacedImages(presentation.unplacedImages, basename);
  if (appendix) output += `\n\n${appendix}`;

  return output;
}

/**
 * Trailing section for images that resolved to a file but could not be linked to
 * any slide (their container was lost to a partially decoded chunk). Emitted so
 * the content is preserved in the doc for manual placement.
 */
function renderUnplacedImages(fileNames: string[], basename: string): string {
  if (fileNames.length === 0) return "";

  const blocks = [
    "{/* Unplaced images: these could not be linked to a slide (container lost to a partially-decoded chunk) */}",
    ...fileNames.map((fileName) => `![image](/img/presentations/${basename}/${fileName})`),
  ];
  return blocks.join("\n\n");
}

function renderSlide(slide: Slide, basename: string): string {
  const blocks = slideBlocks(slide, basename);
  if (blocks.length === 0) return "<Slide />";

  const open = slide.className ? `<Slide className="${slide.className}">` : "<Slide>";
  return `${open}\n${indent(blocks.join("\n\n"))}\n</Slide>`;
}

function slideBlocks(slide: Slide, basename: string): string[] {
  const blocks: string[] = [];

  if (slide.title) blocks.push(`# ${escapeMdxText(slide.title)}`);
  if (slide.body.length > 0) blocks.push(renderBullets(slide.body));

  for (const textBox of slide.textBoxes) {
    blocks.push(renderTextBox(textBox));
  }

  for (const image of slide.images) {
    blocks.push(`![${escapeMdxText(image.altText)}](/img/presentations/${basename}/${image.fileName})`);
  }

  for (const video of slide.videos) {
    blocks.push(`{/* video: /img/presentations/${basename}/${video} */}`);
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

function renderTextBox(textBox: TextBox): string {
  if (textBox.kind === "code") {
    return `\`\`\`${textBox.language}\n${textBox.text}\n\`\`\``;
  }
  return textBox.paragraphs.map((paragraph) => escapeMdxText(paragraph.text)).join("\n\n");
}

/** Indents every non-blank line by two spaces (slide content sits inside `<Slide>`). */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join("\n");
}
