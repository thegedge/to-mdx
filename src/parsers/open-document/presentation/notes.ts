import dedent from "dedent-js";
import { BaseElement } from "../../base_element.ts";

export class Notes extends BaseElement {
  toMdx(): string {
    return dedent`
<SpeakerNotes>
  ${this}
</SpeakerNotes>
    `;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("\n");
  }

  static {
    BaseElement.registerFor.call(this, "presentation:notes");
  }
}
