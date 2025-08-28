import type { StyleProperties } from "../../../styles.ts";
import { BaseElement, type ParseContext } from "../../base_element.ts";

export class AutomaticStyles extends BaseElement {
  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    context.styles.merge(this.toCss());
  }

  empty(): boolean {
    return false;
  }

  toMdx(): string {
    return this.context("styles").toMdx();
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, StyleProperties> {
    return this.children.reduce(
      (acc, child) => ({
        ...acc,
        // TODO avoid having to this
        ...(child as unknown as { toCss: () => Record<string, string | undefined> }).toCss(),
      }),
      {},
    );
  }

  static {
    BaseElement.registerFor.call(this, "office:automatic-styles");
  }
}
