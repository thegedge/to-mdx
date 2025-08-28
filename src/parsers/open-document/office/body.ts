import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Body extends BaseElement {
  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
  }

  toMdx(): string {
    return this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("");
  }

  static {
    BaseElement.registerFor.call(this, "office:body");
  }
}
