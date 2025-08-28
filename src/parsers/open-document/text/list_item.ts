import { BaseElement } from "../../base_element.ts";

export class ListItem extends BaseElement {
  toMdx(): string {
    const content = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("");
    return `<li>${content}</li>`;
  }

  toString(): string {
    const content = this.contentfulChildren()
      .map((child) => child.toString())
      .map((str) => str.replace(/\n$/, "")) // chomp equivalent
      .join(" ");
    return `- ${content}`;
  }

  static {
    BaseElement.registerFor.call(this, "text:list-item");
  }
}
