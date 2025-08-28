import type { ParseContext } from "../base_element.ts";
import { BaseElement } from "../base_element.ts";

export abstract class OpenDocumentBase extends BaseElement {
  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
  }

  static escapeForMdx(text: string): string {
    return text.replace(/{/g, "\\{");
  }
}
