import { BaseElement } from "../../base_element.ts";
import { FillImage } from "./fill_image.ts";

export class DrawingPageProperties extends BaseElement {
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
        case "draw:fill-color":
          cssProperties["background-color"] = value;
          break;
        case "draw:fill":
          if (value === "bitmap") {
            cssProperties["background-repeat"] = "no-repeat";
            cssProperties["background-size"] = "cover";
          }
          break;
        case "draw:fill-image-name": {
          const fillImage = FillImage.getFillImage(value);
          if (fillImage) {
            Object.assign(cssProperties, fillImage.toCss());
          }
          break;
        }
      }
    });

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "style:drawing-page-properties");
  }
}
