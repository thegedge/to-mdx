import { BaseElement } from "../../base_element.ts";

export class TableColumnProperties extends BaseElement {
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
        case "style:column-width":
          cssProperties.width = value;
          break;
      }
    });

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "style:table-column-properties");
  }
}
