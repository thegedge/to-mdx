import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class FillImage extends BaseElement {
  private static fillImages = new Map<string, FillImage>();

  static getFillImage(name: string): FillImage | undefined {
    return this.fillImages.get(name);
  }

  private href: string | null;
  private name: string | null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.href = this.attr("xlink:href");
    this.name = this.attr("draw:name");
    if (this.name) {
      FillImage.fillImages.set(this.name, this);
    }
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  empty(): boolean {
    return !this.href;
  }

  toCss(): Record<string, string> {
    const basename = this.context("basename");
    if (!basename || !this.href) {
      return {};
    }

    const href = `/img/presentations/${basename}/${this.href.replace(/^Pictures\//, "")}`;
    return {
      "background-image": `url('${href}')`,
      "background-repeat": "no-repeat",
      "background-size": "cover",
    };
  }

  static {
    BaseElement.registerFor.call(this, "draw:fill-image");
  }
}
