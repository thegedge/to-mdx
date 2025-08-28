import { BaseElement } from "../../base_element.ts";

export class Presentation extends BaseElement {
  toMdx(): string {
    const slidesContent = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("\n");

    return `<Slides>
${slidesContent}
</Slides>`;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("");
  }

  static {
    BaseElement.registerFor.call(this, "office:presentation");
  }
}
