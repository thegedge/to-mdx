import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class StyleNode extends BaseElement {
  private name: string | null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.name = this.attr("style:name");
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, Record<string, string>> {
    if (!this.name) {
      return {};
    }

    const childStyles = this.children
      .map((child) => {
        if ("toCss" in child && typeof child.toCss === "function") {
          return (child as unknown as { toCss: () => Record<string, string> }).toCss();
        }
        return {};
      })
      .reduce((acc, styles) => ({ ...acc, ...styles }), {});

    return { [this.name]: childStyles };
  }

  protected withContext(context: ParseContext): ParseContext {
    return {
      ...context,
      style_family: this.attr("style:family"),
    };
  }

  static {
    BaseElement.registerFor.call(this, "style:style", "style:default-style");
  }
}
