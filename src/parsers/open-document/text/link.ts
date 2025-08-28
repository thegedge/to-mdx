import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Link extends BaseElement {
  private href: string;
  private styleName: Style | undefined = undefined;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.href = this.attr("xlink:href") || "";
    this.styleName = context.styles.use(this.attr("text:style-name"));
  }

  empty(): boolean {
    return !this.href || this.href.length === 0;
  }

  toMdx(): string {
    const altText = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");

    if (this.styleName?.empty()) {
      return `<a href="${this.href}">${altText}</a>`;
    }

    return `<a href="${this.href}" className="${this.styleName}">${altText}</a>`;
  }

  toString(): string {
    const altText = this.contentfulChildren()
      .map((child) => child.toString())
      .join("");
    return `[${altText}](${this.href})`;
  }

  static {
    BaseElement.registerFor.call(this, "text:a");
  }
}
