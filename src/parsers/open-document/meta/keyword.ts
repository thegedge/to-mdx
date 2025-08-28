import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Keyword extends BaseElement {
  private keywordText: string;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.keywordText = (element.textContent || "").trim();

    if (this.keywordText) {
      context.keywords ??= [];
      (context.keywords as string[]).push(this.keywordText);
    }
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return this.keywordText || "";
  }

  static {
    BaseElement.registerFor.call(this, "meta:keyword");
  }
}
