import dedent from "dedent-js";
import { partition } from "lodash-es";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { TableColumn } from "./table-column.ts";
import { TableRow } from "./table-row.ts";

export class Table extends BaseElement {
  private styleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = context.styles.use(this.attr("table:style-name"));
  }

  toMdx(): string {
    const [columns, rows] = partition(this.children, (child) => child instanceof TableColumn);
    const columnContent = columns.map((child) => child.toMdx()).join("\n");
    const content = rows.map((child) => child.toMdx()).join("\n");
    const styleClass = ` className="w-full h-full${this.styleName.empty() ? "" : ` ${this.styleName}`}"`;
    return dedent`
      <table${styleClass}>
        <thead>
          ${columnContent}
        </thead>
        <tbody>
          ${content}
        </tbody>
      </table>
    `;
  }

  toString(): string {
    const rows = this.children.filter((child) => child instanceof TableRow);
    return rows.map((child) => child.toString()).join("\n");
  }

  static {
    BaseElement.registerFor.call(this, "table:table");
  }
}
