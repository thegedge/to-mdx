import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Description extends BaseElement {
  private descriptionText: string;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.descriptionText = (element.textContent || "").trim();

    if (this.descriptionText) {
      const truncated =
        this.descriptionText.length > 80 ? `${this.descriptionText.slice(0, 77)}...` : this.descriptionText;
      console.log(`🔍 Found presentation description: ${truncated}`);

      context.description = this.descriptionText;
    }
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return this.descriptionText || "";
  }

  static {
    BaseElement.registerFor.call(this, "dc:description");
  }
}
