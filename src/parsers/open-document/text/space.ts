import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Space extends BaseElement {
  private text: string;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.text = " ".repeat(this.count);
  }

  empty(): boolean {
    return false;
  }

  toMdx(): string {
    return this.text;
  }

  toString(): string {
    return this.text;
  }

  get count(): number {
    return parseInt(this.attr("text:c") || "1", 10);
  }

  static {
    BaseElement.registerFor.call(this, "text:s");
  }
}
