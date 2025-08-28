import { CodeDetector } from "../../../detectors/code-detector.ts";
import type { Style } from "../../../styles.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class TextBox extends BaseElement {
  private textStyleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.textStyleName = context.styles.use(this.attr("draw:text-style-name"));
  }

  toMdx(): string {
    const codeSnippet = this.codeDetector.maybeCodeSnippet();
    if (codeSnippet) {
      return codeSnippet;
    }

    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join(" ");

    // Text boxes are always preformatted text in ODP
    const className = this.textStyleName.empty() ? "" : ` className="${this.textStyleName}"`;
    return `<pre${className}>${content}</pre>`;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("");
  }

  private get codeDetector(): CodeDetector {
    return new CodeDetector(this, () => this.toString());
  }

  static {
    BaseElement.registerFor.call(this, "draw:text-box");
  }
}
