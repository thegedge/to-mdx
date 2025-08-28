import { BaseElement } from "../../base_element.ts";

export class Layer extends BaseElement {
  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  static {
    BaseElement.registerFor.call(this, "draw:layer");
  }
}
