import { LanguageDetector } from "../../../detectors/language-detector.ts";
import type { Paragraph, TextBox } from "../model.ts";

/**
 * Decides whether a run of paragraphs is source code and, if so, returns a
 * fenced-code `TextBox`. The on-slide ODP path keys code detection off a
 * monospace font, which Keynote text storage does not surface here, so we reuse
 * the shared `LanguageDetector` for the language label and fall back to a
 * conservative structural check (punctuation/keyword density) to decide the
 * fence itself — that catches code in languages the detector doesn't know (e.g.
 * the BPF slide) without flagging ordinary bullet prose.
 */
export function asTextBox(paragraphs: Paragraph[]): TextBox {
  const text = paragraphs.map((paragraph) => paragraph.text).join("\n");
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
  if (lines.length < 2) return false;
  if (!lines.some((line) => STRONG_CODE.test(line))) return false;

  const codeLines = lines.filter((line) => CODE_LINE.test(line)).length;
  return codeLines / lines.length >= 0.6;
}
