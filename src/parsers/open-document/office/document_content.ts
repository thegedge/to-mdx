import dedent from "dedent-js";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { AutomaticStyles } from "./automatic-styles.ts";
import { Body } from "./body.ts";

export class DocumentContent extends BaseElement {
  private styles?: AutomaticStyles;
  private body?: Body;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styles = this.children.find((child) => child instanceof AutomaticStyles);
    this.body = this.children.find((child) => child instanceof Body);
  }

  toMdx(): string {
    const stylesContent = this.styles ? this.styles.toMdx() : "";
    const bodyContent = this.body ? this.body.toMdx() : "";

    return dedent`
      ${stylesContent}
      ${bodyContent}
    `;
  }

  toString(): string {
    return this.body ? this.body.toString() : "";
  }

  static {
    BaseElement.registerFor.call(this, "office:document-content");
  }
}
