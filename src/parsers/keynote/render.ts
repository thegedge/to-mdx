import type { Paragraph, Presentation, Slide, TextBox } from "./model.ts";

const INDENT = "  ";

export function presentationToMdx(presentation: Presentation, basename: string): string {
  const sections = presentation.slides
    .map((slide) => renderSlide(slide, basename))
    .filter((block) => block.trim().length > 0);

  const appendix = renderUnplacedImages(presentation.unplacedImages, basename);
  if (appendix) sections.push(appendix);

  return sections.join("\n\n---\n\n");
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
  const blocks: string[] = [];

  if (slide.title) blocks.push(`# ${slide.title}`);
  if (slide.body.length > 0) blocks.push(renderBullets(slide.body));

  for (const textBox of slide.textBoxes) {
    blocks.push(renderTextBox(textBox));
  }

  for (const image of slide.images) {
    blocks.push(`![${image.altText}](/img/presentations/${basename}/${image.fileName})`);
  }

  for (const video of slide.videos) {
    blocks.push(`{/* video: /img/presentations/${basename}/${video} */}`);
  }

  if (slide.tableCount > 0) {
    blocks.push(`{/* ${slide.tableCount} table(s) on this slide were not extracted */}`);
  }

  if (slide.notes.length > 0) {
    blocks.push(`{/* Presenter notes:\n${slide.notes.map((p) => p.text).join("\n")}\n*/}`);
  }

  return blocks.filter((block) => block.length > 0).join("\n\n");
}

function renderBullets(paragraphs: Paragraph[]): string {
  return paragraphs.map((paragraph) => `${INDENT.repeat(Math.max(0, paragraph.depth))}- ${paragraph.text}`).join("\n");
}

function renderTextBox(textBox: TextBox): string {
  if (textBox.kind === "code") {
    return `\`\`\`${textBox.language}\n${textBox.text}\n\`\`\``;
  }
  return textBox.paragraphs.map((paragraph) => paragraph.text).join("\n\n");
}
