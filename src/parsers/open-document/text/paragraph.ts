import dedent from "dedent-js";
import { memoize } from "lodash-es";
import type { Style } from "../../../styles.ts";
import type { ParseContext, ParsedElement } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";
import { TableCell } from "../table/table-cell.ts";
import { PlainText } from "./plain_text.ts";
import { Span } from "./span.ts";

export class Paragraph extends BaseElement {
  private styleName: Style;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.styleName = context.styles.use(this.attr("text:style-name"));
  }

  empty(): boolean {
    return false;
  }

  toMdx(): string {
    const mergedChildren = this.getMergedChildren();
    const text = mergedChildren.map((child) => child.toMdx()).join("");

    let tag = "p";
    let otherAttrs = "";
    if (this.context("isSvg")) {
      tag = "text";
      otherAttrs = ` x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"`;
    }

    if (this.parentNode instanceof TableCell && !this.context("isSvg")) {
      return text;
    }

    return dedent`
      <${tag}${otherAttrs} className="${this.styleName}">
        ${text}
      </${tag}>
    `;
  }

  toString(): string {
    const text = this.contentfulChildren()
      .map((child) => child.toString())
      .join("");
    return `${text}\n`;
  }

  private getMergedChildren = memoize((): ParsedElement[] => {
    return this.contentfulChildren().reduce<ParsedElement[]>((acc, child) => {
      const previous = acc[acc.length - 1];
      if (this.spansCanBeMerged(previous, child)) {
        // TODO drop this
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (previous as any).children = [new PlainText(previous.toString() + child.toString())];
      } else {
        acc.push(child);
      }
      return acc;
    }, []);
  });

  private spansCanBeMerged(a: ParsedElement | undefined, b: ParsedElement): boolean {
    return a instanceof Span && b instanceof Span && a.isPlaintext() && b.isPlaintext() && a.styleName === b.styleName;
  }

  static {
    BaseElement.registerFor.call(this, "text:p");
  }
}
