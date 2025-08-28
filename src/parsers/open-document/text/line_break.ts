import { BaseElement } from "../../base_element.ts";

export class LineBreak extends BaseElement {
  empty(): boolean {
    return false;
  }

  toMdx(): string {
    return "<br />";
  }

  toString(): string {
    return "\n";
  }

  static {
    BaseElement.registerFor.call(this, "text:line-break");
  }
}
