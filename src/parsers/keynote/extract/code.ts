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
  // Use `raw` (leading whitespace preserved) so indentation survives inside the
  // fence; fall back to the trimmed `text` for un-indented lines.
  const text = paragraphs.map((paragraph) => paragraph.raw ?? paragraph.text).join("\n");
  const language = LanguageDetector.detect(text) ?? (isEbpfCode(text) ? "c" : null);

  if (language || looksLikeCode(paragraphs)) {
    return { kind: "code", language: language ?? "", text };
  }
  return { kind: "text", paragraphs };
}

/**
 * True when the text is an eBPF program. eBPF is written in C but uses BPF-specific
 * helpers/macros; starry-night (linguist) has no "eBPF" grammar, so we fence such
 * snippets as plain `c`. Keyed off BPF map macros (`BPF_HASH`), kprobe entrypoint
 * names (`kprobe__...`), and `bpf_*` helper calls.
 */
export function isEbpfCode(text: string): boolean {
  return /\bBPF_HASH\b|\bkprobe__|\bbpf_[a-z_]+\(/.test(text);
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
