import { BaseElement } from "../../base_element.ts";

export class Equation extends BaseElement {
  empty(): boolean {
    return true;
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  static {
    BaseElement.registerFor.call(this, "draw:equation");
  }
}
