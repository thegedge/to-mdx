import dedent from "dedent-js";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Image extends BaseElement {
  private href = "";
  private altText = "image";
  private imagePath: string | null = null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);

    // ODP files use xlink:href for image references
    this.href = this.attr("xlink:href") || this.attr("href") || "";
    this.altText = element.textContent?.trim() || "image";

    if (!this.empty()) {
      this.imagePath = `/img/presentations/${this.context("basename")}/${this.href.replace(/^Pictures\//, "")}`;
    }
  }

  empty(): boolean {
    return !this.href || this.href.length === 0 || this.href.endsWith(".svm");
  }

  shouldFill(): boolean {
    if (this.empty()) return false;

    // Find parent frame to check dimensions
    let parentFrame: Element | null = null;
    let current = this.element.parentNode;
    while (current && current.nodeType === 1) {
      if ((current as Element).nodeName === "draw:frame") {
        parentFrame = current as Element;
        break;
      }
      current = current.parentNode;
    }

    if (parentFrame) {
      const widthCm = parentFrame.getAttribute("svg:width");
      const heightCm = parentFrame.getAttribute("svg:height");
      return !!(widthCm && heightCm);
    }

    return false;
  }

  toMdx(): string {
    if (this.empty()) {
      return "";
    }

    if (this.shouldFill()) {
      return dedent`
        <Image
          alt="${this.altText}"
          src="${this.imagePath}"
          className="w-full h-full object-contain"
        />
      `;
    } else {
      return this.toString();
    }
  }

  toString(): string {
    return `![${this.altText}](${this.imagePath})`;
  }

  static {
    BaseElement.registerFor.call(this, "draw:image");
  }
}
