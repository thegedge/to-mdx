import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import { cls, type Maybe } from "../../../utils.ts";
import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

declare module "../../base_element.ts" {
  interface ParseContext {
    layoutClass?: string | null;
  }
}

export class Page extends BaseElement {
  private pageClass: string | null = null;
  private styleName: Style | undefined = undefined;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.pageClass = this.attr("presentation:class");
    this.styleName = context.styles.use(this.attr("draw:style-name"));
  }

  empty(): boolean {
    // We always generate a slide, even if there's no content (often used as a "breather" slide)
    return false;
  }

  toMdx(): string {
    const slideContent = this.contentfulChildren()
      .map((child) => child.toMdx())
      .join("\n  ");

    // If there's not content, we just have an empty "breather" slide
    if (!slideContent.trim()) {
      return `<Slide />`;
    }

    const className = cls(this.getChildLayoutClass(), this.getLayoutClass(), this.pageClass, this.styleName);
    const slideTag = className ? `<Slide className="${className}">` : "<Slide>";
    return dedent`
      ${slideTag}
        ${slideContent}
      </Slide>
    `;
  }

  toString(): string {
    return this.contentfulChildren()
      .map((child) => child.toString())
      .join("\n");
  }

  withContext(context: ParseContext): ParseContext {
    return {
      ...context,
      layoutClass: this.getLayoutClass(),
    };
  }

  private get masterPageName(): Maybe<string> {
    return this.attr("draw:master-page-name");
  }

  private getChildLayoutClass(): string | null {
    if (this.singleChild((child) => "layoutClass" in child)) {
      const firstChild = this.contentfulChildren()[0] as unknown as { layoutClass: unknown };
      const childLayoutClass = firstChild.layoutClass;
      if (typeof childLayoutClass === "string") {
        return childLayoutClass;
      }
    }
    return null;
  }

  private getLayoutClass(): string | null {
    if (!this.context("options")?.useHeuristics) {
      return null;
    }

    const masterPageName = this.masterPageName?.toLowerCase();
    if (!masterPageName) {
      return null;
    }

    switch (masterPageName) {
      case "caption_5f_only":
        return "caption";
      case "section_5f_title_5f_and_5f_description":
        return "two-column with-description";
      case "title":
        return "title";
      case "title_5f_only":
      case "title_5f_and_5f_body":
        return "title-with-points";
      default:
        return null;
    }
  }

  static {
    BaseElement.registerFor.call(this, "draw:page");
  }
}
