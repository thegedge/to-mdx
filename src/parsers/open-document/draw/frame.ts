import dedent from "dedent-js";
import json5 from "json5";
import type { Style } from "../../../styles.ts";
import { cls, type Maybe } from "../../../utils.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { LayoutDetection } from "../mixins/layout_detection.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    frameWidth?: string | null;
    frameHeight?: string | null;
  }
}

export class Frame extends BaseElement {
  private presentationClass: Maybe<string>;
  private presentationStyleName: Style;
  private drawTextStyleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.presentationClass = this.attr("presentation:class");
    this.presentationStyleName = context.styles.use(this.attr("presentation:style-name"));
    this.drawTextStyleName = context.styles.use(this.attr("draw:text-style-name"));
  }

  toMdx(): string {
    if (this.context("options")?.useHeuristics) {
      switch (this.presentationClass) {
        case "title":
        case "subtitle":
          return this.toString();
      }
    }

    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("\n");

    if (this.context("options")?.useHeuristics) {
      switch (this.context("layoutClass")) {
        case "two-column with-description": {
          if (this.presentationClass === "outline") {
            return dedent`
              <div>
                ${content}
              </div>
            `;
          }
        }
      }
    }

    const layoutDetection = new LayoutDetection(this);
    if (!layoutDetection.needsPositioning) {
      return content;
    }

    const styleObject = layoutDetection.generatePositioningStyleObject();
    const classNames = cls(this.presentationStyleName, this.drawTextStyleName);
    const classAttr = classNames ? ` className="${classNames}"` : "";

    return dedent`
      <div${classAttr} style={${json5.stringify(styleObject, { quote: '"' })}}>
        ${content}
      </div>
    `;
  }

  toString(): string {
    const content = this.contentfulChildren()
      .map((child) => child.toString())
      .join("");

    switch (this.presentationClass) {
      case "title":
      case "outline":
        return `# ${content.trim().replaceAll(/\s+/g, " ")}`;
      case "subtitle":
        return `## ${content.trim().replaceAll(/\s+/g, " ")}`;
      default:
        return content;
    }
  }

  get layoutClass(): Maybe<string> {
    return new LayoutDetection(this).layoutClass;
  }

  protected withContext(context: ParseContext): ParseContext {
    return {
      ...context,
      frameWidth: this.attr("svg:width"),
      frameHeight: this.attr("svg:height"),
    };
  }

  static {
    BaseElement.registerFor.call(this, "draw:frame");
  }
}
