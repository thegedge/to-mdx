import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class TableCell extends BaseElement {
  private style: Style;
  private defaultStyle: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);

    this.style = context.styles.use(this.attr("table:style-name"));
    this.defaultStyle = context.styles.use(context.defaultCellStyleName);
  }

  toMdx(): string {
    const effectiveStyle = this.style.empty() ? this.defaultStyle : this.style;
    const noVPaddingStyle = effectiveStyle.without("padding-top", "padding-bottom");
    const styleClass = noVPaddingStyle.empty() ? "" : ` className="${noVPaddingStyle}"`;
    return dedent`
      <td${styleClass}>
        ${this.children.map((child) => child.toMdx()).join(" ")}
      </td>
    `;
  }

  toString(): string {
    return this.children.map((child) => child.toString()).join(" | ");
  }

  static {
    BaseElement.registerFor.call(this, "table:table-cell");
  }
}
