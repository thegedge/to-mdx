import type { ParsedElement } from "../parsers/base_element.ts";
import { LanguageDetector } from "./language-detector.ts";

export class CodeDetector {
  private element: ParsedElement;
  private toString: () => string;

  constructor(element: ParsedElement, toString: () => string) {
    this.element = element;
    this.toString = toString;
  }

  maybeCodeSnippet(): string | null {
    if (!this.element.context("options")?.useHeuristics) {
      return null;
    }

    const isMonospace = this.isUsingMonospaceFont();
    if (!isMonospace) {
      return null;
    }

    const textContent = this.toString().trim();
    const language = LanguageDetector.detect(textContent);
    if (!language) {
      return null;
    }

    return `\n\`\`\`${language}\n${textContent}\n\`\`\`\n`;
  }

  isUsingMonospaceFont(): boolean {
    for (const child of this.element) {
      const styleName = child.attr("text:style-name");
      if (styleName) {
        const styleProperties = this.element.context("styles").get(styleName);
        const fontName = styleProperties["font-family"];
        if (fontName?.includes("monospace")) {
          return true;
        }
      }

      for (const grandchild of child) {
        const grandStyleName = grandchild.attr("text:style-name");
        if (grandStyleName) {
          const grandStyleProperties = this.element.context("styles").get(grandStyleName);
          const grandFontName = grandStyleProperties["font-family"];
          if (grandFontName?.includes("monospace")) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
