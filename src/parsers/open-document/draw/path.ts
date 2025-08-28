import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { FormulaEvaluator } from "../mixins/formula_evaluator.ts";

export class Path extends BaseElement {
  private drawStyleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.drawStyleName = this.context("styles").use(this.attr("draw:style-name"));
  }

  empty(): boolean {
    return false;
  }

  toMdx(): string {
    const svgPath = this.hasFormula.svgPath();
    if (!svgPath) {
      return "";
    }

    const classAttr = this.drawStyleName.empty() ? "" : ` className="${this.drawStyleName}"`;
    return `<path${classAttr} d="${svgPath}" />`;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .filter(Boolean)
      .join("");
  }

  private get hasFormula(): FormulaEvaluator {
    return new FormulaEvaluator(this);
  }

  static {
    BaseElement.registerFor.call(this, "draw:path");
  }
}
