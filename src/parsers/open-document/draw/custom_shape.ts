import dedent from "dedent-js";
import json5 from "json5";
import { CodeDetector } from "../../../detectors/code-detector.ts";
import type { Style } from "../../../styles.ts";
import type { Maybe } from "../../../utils.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { FormulaEvaluator } from "../mixins/formula_evaluator.ts";
import { LayoutDetection } from "../mixins/layout_detection.ts";
import { SvgElement } from "../mixins/svg_element.ts";
import { EnhancedGeometry } from "./enhanced_geometry.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    isSvg?: boolean;
    formulaEvaluator?: FormulaEvaluator;
  }
}

export class CustomShape extends SvgElement {
  readonly formulaEvaluator: FormulaEvaluator;

  private drawStyle: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.drawStyle = context.styles.use(this.attr("draw:style-name"));
    this.formulaEvaluator = new FormulaEvaluator(this);
  }

  toMdx(): string {
    const layoutDetection = new LayoutDetection(this);
    const codeSnippet = this.codeDetector.maybeCodeSnippet();
    if (codeSnippet) {
      if (layoutDetection.needsPositioning) {
        return dedent`
          <div style={${json5.stringify(layoutDetection.generatePositioningStyleObject())}}>
            ${codeSnippet}
          </div>
        `;
      }
      return codeSnippet;
    }

    let content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");

    let divClassAttr = "";
    if (this.isSvg) {
      content = this.wrapWithSvgTag(content, this.drawStyle);
    } else {
      divClassAttr = ` className="${this.drawStyle}"`;
    }

    if (!layoutDetection.needsPositioning) {
      return content;
    }

    const styleObject = layoutDetection.generatePositioningStyleObject();
    return dedent`
      <div${divClassAttr} style={${json5.stringify(styleObject, { quote: '"' })}}>
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

  get layoutClass(): Maybe<string> {
    return new LayoutDetection(this).layoutClass;
  }

  get isSvg(): boolean {
    const enhancedGeometry = this.children.filter((child) => child instanceof EnhancedGeometry);
    switch (enhancedGeometry.length) {
      case 0:
        return false;
      case 1:
        // In this case, we'll assume this is just a border
        return (enhancedGeometry[0] as unknown as EnhancedGeometry).drawType !== "ooxml-rect";
      default:
        return true;
    }
  }

  protected withContext(context: ParseContext): ParseContext {
    const newContext = {
      ...context,
      formulaEvaluator: new FormulaEvaluator(this),
      parentWidth: parseFloat(this.width || "0"),
      parentHeight: parseFloat(this.height || "0"),
    };

    Object.defineProperty(newContext, "viewBox", { get: () => this.viewBox });
    Object.defineProperty(newContext, "isSvg", { get: () => this.isSvg });

    return newContext;
  }

  private get codeDetector(): CodeDetector {
    return new CodeDetector(this, () => this.toString());
  }

  static {
    BaseElement.registerFor.call(this, "draw:custom-shape");
  }
}
