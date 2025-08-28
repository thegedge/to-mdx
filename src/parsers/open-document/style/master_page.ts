import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class MasterPage extends BaseElement {
  private name: string | null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.name = this.attr("style:name");
  }

  toMdx(): string {
    const backgroundObjects = this.contentfulChildren().filter((child) => {
      return child.attr("draw:layer") === "backgroundobjects";
    });

    return backgroundObjects
      .map((child) => child.toMdx())
      .filter(Boolean)
      .join("\n");
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("\n");
  }

  static {
    BaseElement.registerFor.call(this, "style:master-page");
  }
}
