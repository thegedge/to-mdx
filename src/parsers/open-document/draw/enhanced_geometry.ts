import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { FormulaEvaluator } from "../mixins/formula_evaluator.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    viewBox?: [number, number, number, number];
  }
}

export class EnhancedGeometry extends BaseElement {
  private drawStyleName: Style;
  readonly drawType: string;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.drawStyleName = context.styles.use(this.attr("draw:style-name"));
    this.drawType = this.attr("draw:type") || "";
  }

  empty(): boolean {
    return false;
  }

  toMdx(): string {
    // TODO It seems like the paths don't contain, for example, arrowheads.
    //   We probably need to handle this by looking at specific draw types, and manually emitting the svg.
    //
    // switch (this.drawType) {
    //   case "mso-spt32":
    //     return `...`;
    // }

    const svgPath = this.hasFormula.svgPath();
    if (!svgPath) {
      return "";
    }

    const classAttr = this.drawStyleName.empty() ? "" : ` className="${this.drawStyleName}"`;
    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");
    return `<path${classAttr} d="${svgPath}" />${content}`;
  }

  toString(): string {
    return "";
  }

  private get hasFormula(): FormulaEvaluator {
    return new FormulaEvaluator(this);
  }

  static {
    BaseElement.registerFor.call(this, "draw:enhanced-geometry");
  }
}
