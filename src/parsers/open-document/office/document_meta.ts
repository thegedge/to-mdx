import { BaseElement } from "../../base_element.ts";

export class DocumentMeta extends BaseElement {
  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  static {
    BaseElement.registerFor.call(this, "office:document-meta");
  }
}
