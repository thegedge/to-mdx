import { LanguageDetector } from "../../../detectors/language-detector.ts";
import type { Paragraph, TextBox } from "../model.ts";

/**
 * Returns a fenced-code `TextBox` when a run of paragraphs is source code, else a
 * plain text box. Keynote storage doesn't surface the monospace font the ODP path
 * keys off, so the language comes from the shared `LanguageDetector` and the fence
 * decision falls back to a structural check (`looksLikeCode`) for languages the
 * detector doesn't label.
 */
export function asTextBox(paragraphs: Paragraph[]): TextBox {
  // `raw` keeps leading whitespace so indentation survives inside the fence.
  const text = paragraphs.map((paragraph) => paragraph.raw ?? paragraph.text).join("\n");
  const language = LanguageDetector.detect(text);

  if (language || looksLikeCode(paragraphs)) {
    return { kind: "code", language: language ?? "", text };
  }
  return { kind: "text", paragraphs };
}

// A line that carries code-ish syntax at all...
const CODE_LINE = /[{}();=]|=>|->|::|\/\/|\/\*|#include|\bdef\b|\breturn\b|\bif\s*\(|\bfor\s*\(|\bfunction\b|\w+\(/;
// ...versus a strong signal that text really is code, not punctuated prose.
const STRONG_CODE = /[{};]|=>|->|::|#include|\bdef\b|\bfunction\b|\w+\([^)]*\)\s*[{;]?/;

function looksLikeCode(paragraphs: Paragraph[]): boolean {
  const lines = paragraphs.map((paragraph) => paragraph.text).filter((line) => line.length > 0);
  if (lines.length < 2) {
    return false;
  }
  if (!lines.some((line) => STRONG_CODE.test(line))) {
    return false;
  }

  const codeLines = lines.filter((line) => CODE_LINE.test(line)).length;
  return codeLines / lines.length >= 0.6;
}
