import json5 from "json5";
import { convertCmToPercent } from "../../../utils.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    defaultCellStyleName?: string | null;
  }
}

export class TableColumn extends BaseElement {
  private styleName: string | null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = this.attr("table:style-name");
  }

  toMdx(): string {
    let width = this.context("styles").properties(this.styleName || "").width;
    if (width) {
      const frameWidth = this.context("frameWidth");
      if (frameWidth) {
        width = convertCmToPercent(width, parseFloat(frameWidth)) ?? undefined;
      }
    }

    return `<th scope="col" style={${json5.stringify({ width: width || "100%" })}} />`;
  }

  toString(): string {
    return "";
  }

  static {
    BaseElement.registerFor.call(this, "table:table-column");
  }
}
