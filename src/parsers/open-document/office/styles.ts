import { BaseElement } from "../../base_element.ts";

export class Styles extends BaseElement {
  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, unknown> {
    return this.children
      .map((child) => {
        if ("toCss" in child && typeof child.toCss === "function") {
          return (child as unknown as { toCss: () => Record<string, unknown> }).toCss();
        }
        return {};
      })
      .reduce((acc, styles) => ({ ...acc, ...styles }), {});
  }

  static {
    BaseElement.registerFor.call(this, "office:styles");
  }
}
