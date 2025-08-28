import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { PlainText } from "./plain_text.ts";

export class Span extends BaseElement {
  readonly styleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = context.styles.use(this.attr("text:style-name"));
  }

  toMdx(): string {
    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");

    if (this.styleName.empty()) {
      return content;
    }

    const tag = this.context("isSvg") ? "tspan" : "span";
    return `<${tag} className="${this.styleName}">${content}</${tag}>`;
  }

  toString(): string {
    const content = this.contentfulChildren()
      .map((child) => child.toString())
      .join("");

    if (this.isPlaintext() && this.hasBackground()) {
      return `___${content}___`;
    } else {
      return content;
    }
  }

  isPlaintext(): boolean {
    return this.singleChild((child) => child instanceof PlainText);
  }

  private hasBackground(): boolean {
    // We get the attribute from the element, not the style name member, because we don't want to process it yet
    const styleName = this.attr("text:style-name");
    if (!styleName) {
      return false;
    }

    const styleProperties = this.context("styles").get(styleName);
    return !!styleProperties["background-color"];
  }

  static {
    BaseElement.registerFor.call(this, "text:span");
  }
}
