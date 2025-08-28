import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class UserDefined extends BaseElement {
  private name: string | null;
  private value: unknown;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.name = this.attr("meta:name");
    this.value = this.processValue((element.textContent || "").trim(), context);
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    if (!this.name || !this.value) {
      return "";
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `${this.name}: ${this.value}`;
  }

  private processValue(value: string, context: ParseContext): unknown {
    if (!this.name || !value) {
      return null;
    }

    const underscoredName = this.name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, " ")
      .replace(/\s+/g, "_");

    switch (underscoredName) {
      case "keywords":
      case "tags": {
        const keywords = value
          .split(", ")
          .map((k) => k.trim())
          .filter(Boolean);
        if (keywords.length > 0) {
          context.keywords ??= [];
          (context.keywords as string[]).push(...keywords);
        }
        return keywords;
      }
      case "date":
      case "presentation_date": {
        try {
          const presentationDate = new Date(value);
          if (!isNaN(presentationDate.getTime())) {
            context.date = presentationDate;
            return presentationDate;
          }
        } catch {
          // Fall through to default case
        }
        context[underscoredName] = value;
        return value;
      }
      default: {
        // Handle event_* and company_* properties
        const eventMatch = /^(event|company)_(.+)$/.exec(underscoredName);
        if (eventMatch) {
          const [, namespace, propertyName] = eventMatch;
          if (!context[namespace]) {
            context[namespace] = {};
          }
          (context[namespace] as Record<string, unknown>)[propertyName] = value;
          return context[namespace];
        }

        context[underscoredName] = value;
        return value;
      }
    }
  }

  static {
    BaseElement.registerFor.call(this, "meta:user-defined");
  }
}
