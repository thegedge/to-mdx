import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    defaultCellStyleName?: string | null;
  }
}

export class TableRow extends BaseElement {
  private styleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = context.styles.use(this.attr("table:style-name"));
  }

  toMdx(): string {
    const content = this.children.map((child) => child.toMdx()).join("");
    const styleClass = this.styleName.empty() ? "" : ` className="${this.styleName}"`;
    return dedent`
      <tr${styleClass}>
        ${content}
      </tr>
    `;
  }

  toString(): string {
    return this.children.map((child) => child.toString()).join(" | ");
  }

  withContext(context: ParseContext): ParseContext {
    return {
      ...context,
      defaultCellStyleName: this.attr("table:default-cell-style-name"),
    };
  }

  static {
    BaseElement.registerFor.call(this, "table:table-row");
  }
}
