import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Meta extends BaseElement {
  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  static {
    BaseElement.registerFor.call(this, "office:meta");
  }
}
