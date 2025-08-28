import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Title extends BaseElement {
  private titleText: string;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);

    this.titleText = (element.textContent || "").trim();
    if (this.titleText) {
      context.title = this.titleText;
    }
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return this.titleText || "";
  }

  static {
    BaseElement.registerFor.call(this, "dc:title");
  }
}
