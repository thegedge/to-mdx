import { DOMParser } from "@xmldom/xmldom";
import type { Styles } from "../styles.ts";
import { PlainText } from "./open-document/text/plain_text.ts";

export interface ParseContext {
  metadata?: Record<string, unknown>;
  basename?: string;
  options?: {
    useHeuristics?: boolean;
  };
  pageDimensions?: {
    width: number;
    height: number;
  };
  styles: Styles;
  [key: string]: unknown;
}

export type ParsedElement = {
  toMdx(): string;
  toString(): string;
  empty(): boolean;
  attr(name: string): string | null;
  context<K extends keyof ParseContext>(key: K): ParseContext[K];
  [Symbol.iterator](): Iterator<ParsedElement>;

  childElementCount: number;
};

type ParserConstructor = new (
  element: Element | Node,
  context?: ParseContext,
  parentNode?: ParsedElement | null,
) => ParsedElement;

export abstract class BaseElement {
  private static registeredParsers = new Map<string, ParserConstructor>();

  static registerFor(...elementNames: string[]): void {
    elementNames.forEach((elementName) => {
      BaseElement.registeredParsers.set(elementName, this as unknown as ParserConstructor);
    });
  }

  static parseXml(content: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(content, "text/xml");
  }

  static parse(element: Element, context: ParseContext, parentNode: ParsedElement | null = null): BaseElement | null {
    const parserClass = BaseElement.registeredParsers.get(element.nodeName);

    if (!parserClass) return null;

    return new parserClass(element, context, parentNode) as unknown as BaseElement;
  }

  readonly parentNode: ParsedElement | null;

  protected element: Element;
  protected context_: Readonly<ParseContext>;
  protected children: ParsedElement[];

  constructor(element: Element, context: ParseContext, parentNode: ParsedElement | null = null) {
    // These are assigned in a very particular order:
    //   1. `element` is assigned first, so that `withContext` can use things like `this.attr`
    //   2. `context` is assigned next, first to the given context, so that `withContext` can use things like `this.context`
    //   3. `children` is assigned last
    this.element = element;
    this.context_ = context;
    this.context_ = this.withContext(context);
    this.children = this.parseChildren();
    this.parentNode = parentNode;
  }

  abstract toMdx(): string;
  abstract toString(): string;

  attr(name: string): string | null {
    return this.element.getAttribute(name);
  }

  context<K extends keyof ParseContext>(key: K): ParseContext[K] {
    return this.context_[key];
  }

  empty(): boolean {
    return this.contentfulChildren().length === 0;
  }

  get childElementCount(): number {
    return this.children.length;
  }

  singleChild(predicate?: (child: ParsedElement) => boolean): boolean {
    const children = this.contentfulChildren().filter(
      (child) =>
        // Filter out presentation notes like the Ruby version
        child.constructor.name !== "Notes",
    );

    if (children.length !== 1) {
      return false;
    }

    return predicate ? predicate(children[0]) : true;
  }

  [Symbol.iterator](): Iterator<ParsedElement> {
    return this.children[Symbol.iterator]();
  }

  private parseChildren(): ParsedElement[] {
    if (this.element.childNodes.length === 0) {
      return [];
    }

    const children: ParsedElement[] = [];
    Array.from(this.element.childNodes).forEach((child) => {
      switch (child.nodeType) {
        case 1: {
          // Node.ELEMENT_NODE
          const parsed = BaseElement.parse(child as Element, this.context_, this);
          if (parsed) {
            children.push(parsed);
          }
          break;
        }
        case 3: {
          // Node.TEXT_NODE
          const textContent = child.textContent || "";
          children.push(new PlainText(textContent));
          break;
        }
        default:
          break;
      }
    });
    return children;
  }

  protected withContext(context: ParseContext): ParseContext {
    return context;
  }

  protected contentfulChildren(): ParsedElement[] {
    return this.children.filter((child) => !child.empty());
  }
}
