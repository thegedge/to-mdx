import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class List extends BaseElement {
  private styleName: Style | undefined = undefined;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = context.styles.use(this.attr("text:style-name"));
  }

  toMdx(): string {
    const styleClass = this.styleName?.empty() ? "" : ` className="${this.styleName}"`;
    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");

    return dedent`
      <ul${styleClass}>
        ${content}
      </ul>
    `;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("\n");
  }

  static {
    BaseElement.registerFor.call(this, "text:list");
  }
}
