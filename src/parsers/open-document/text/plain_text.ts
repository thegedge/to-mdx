import { escapeForMdx } from "../../../utils.ts";
import { type ParseContext, type ParsedElement } from "../../base_element.ts";

export class PlainText implements ParsedElement {
  private text: string;

  readonly childElementCount = 0;

  constructor(text: string) {
    this.text = decodeHtmlEntities(text);
  }

  toMdx(): string {
    return escapeForMdx(this.text);
  }

  toString(): string {
    return this.text;
  }

  empty(): boolean {
    return this.text.length === 0;
  }

  attr(_name: string): string | null {
    return null;
  }

  context<K extends keyof ParseContext>(_key: K): ParseContext[K] {
    return null;
  }

  [Symbol.iterator](): Iterator<ParsedElement> {
    return {
      next() {
        return { value: undefined, done: true };
      },
    };
  }
}

const decodeHtmlEntities = (text: string): string => {
  return text
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&lt;/g, "<")
    .replaceAll(/&gt;/g, ">")
    .replaceAll(/&amp;/g, "&");
};
