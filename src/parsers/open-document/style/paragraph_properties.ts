import { BaseElement } from "../../base_element.ts";

export class ParagraphProperties extends BaseElement {
  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, string> {
    const cssProperties: Record<string, string> = {};

    for (const { name, value } of Array.from(this.element.attributes)) {
      switch (name) {
        case "fo:border":
          cssProperties.border = value;
          break;
        case "fo:line-height":
          if (value.endsWith("%")) {
            // 100% in LibreOffice doesn't look like 1 in CSS, so tweak it a bit to be closer to the original
            // As an example, in Google Slides the font-size was 48px and the translations between lines in the pargraph 58px (≈ 1.2)
            cssProperties["line-height"] = ((parseFloat(value) + 20) / 100).toString();
          } else {
            cssProperties["line-height"] = value;
          }
          break;
        case "fo:margin-bottom":
          if (parseFloat(value) !== 0) {
            cssProperties["margin-bottom"] = value;
          }
          break;
        case "fo:margin-left":
          if (parseFloat(value) !== 0) {
            cssProperties["margin-left"] = value;
          }
          break;
        case "fo:margin-right":
          if (parseFloat(value) !== 0) {
            cssProperties["margin-right"] = value;
          }
          break;
        case "fo:margin-top":
          if (parseFloat(value) !== 0) {
            cssProperties["margin-top"] = value;
          }
          break;
        case "fo:text-align":
          if (value !== "start") {
            cssProperties["text-align"] = value;
          }
          break;
        case "fo:text-indent":
          if (parseFloat(value) !== 0) {
            cssProperties["text-indent"] = value;
          }
          break;
        case "style:writing-mode":
          if (value !== "lr-tb") {
            cssProperties["writing-mode"] = value;
          }
          break;
      }
    }

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "style:paragraph-properties");
  }
}
