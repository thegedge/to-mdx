import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Group extends BaseElement {
  private name: string;
  private drawStyleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.name = this.attr("draw:name") || "";
    this.drawStyleName = context.styles.use(this.attr("draw:style-name"));
  }

  toMdx(): string {
    const drawStyleClass = this.drawStyleName.empty() ? "" : ` className="${this.drawStyleName}"`;
    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .filter((content) => content.trim().length > 0)
      .join("");

    return dedent`
      <div${drawStyleClass} data-name="${this.name}">
        ${content}
      </div>
    `;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .filter((content) => content.trim().length > 0)
      .join("");
  }

  static {
    BaseElement.registerFor.call(this, "draw:g");
  }
}
