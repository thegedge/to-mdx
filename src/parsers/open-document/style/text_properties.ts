import { BaseElement } from "../../base_element.ts";

export class TextProperties extends BaseElement {
  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, string> {
    const cssProperties: Record<string, string> = {};

    Array.from(this.element.attributes).forEach((attr) => {
      const { name, value } = attr;
      switch (name) {
        case "fo:background-color":
          cssProperties["background-color"] = value;
          break;
        case "fo:color":
          cssProperties.color = value;
          break;
        case "fo:font-size":
          cssProperties["font-size"] = value;
          break;
        case "fo:font-weight":
          if (value !== "normal") {
            cssProperties["font-weight"] = value;
          }
          break;
        case "fo:font-style":
          if (value !== "normal") {
            cssProperties["font-style"] = value;
          }
          break;
        case "style:text-line-through-type":
          if (value === "single" || value === "double") {
            cssProperties["text-decoration"] = "line-through";
          }
          break;
        case "style:text-line-through-style":
          switch (value) {
            case "solid":
              cssProperties["text-decoration-style"] = "solid";
              break;
            case "dotted":
            case "dot-dash":
            case "dot-dot-dash":
              cssProperties["text-decoration-style"] = "dotted";
              break;
            case "dashed":
            case "long-dash":
              cssProperties["text-decoration-style"] = "dashed";
              break;
            case "wave":
              cssProperties["text-decoration-style"] = "wavy";
              break;
          }
          break;
        case "style:text-line-through-width":
          cssProperties["text-decoration-thickness"] = value;
          break;
        case "style:font-name":
          if (value.includes("Mono")) {
            cssProperties["font-family"] = "'Courier New', Courier, monospace";
          } else if (value.includes("Serif")) {
            cssProperties["font-family"] = "Georgia, 'Times New Roman', Times, serif";
          }

          if (value === "Bold") {
            cssProperties["font-weight"] = "bold";
          } else if (value === "Light") {
            cssProperties["font-weight"] = "light";
          }

          if (value.includes("Italic")) {
            cssProperties["font-style"] = "italic";
          }
          break;
        case "fo:letter-spacing":
          if (value !== "normal") {
            cssProperties["letter-spacing"] = value;
          }
          break;
      }
    });

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "style:text-properties");
  }
}
