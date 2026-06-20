import type { Paragraph, Presentation, Slide, TextBox } from "./model.ts";

const INDENT = "  ";

export function presentationToMdx(presentation: Presentation, basename: string): string {
  return presentation.slides
    .map((slide) => renderSlide(slide, basename))
    .filter((block) => block.trim().length > 0)
    .join("\n\n---\n\n");
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
