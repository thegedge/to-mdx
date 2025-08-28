import type { ParseContext } from "../../base_element.ts";
import { BaseElement } from "../../base_element.ts";

export class Marker extends BaseElement {
  private markerName: string | null = null;

  constructor(element: Element, context: ParseContext, parent: BaseElement | null) {
    super(element, context, parent);
    this.markerName = this.attr("draw:name");
  }

  toMdx(): string {
    return "";
  }

  toString(): string {
    return "";
  }

  toCss(): Record<string, Record<string, string>> {
    if (!this.markerName) {
      return {};
    }

    const properties = this.extractProperties();
    if (Object.keys(properties).length === 0) {
      return {};
    }

    const cssProperties = this.generateMarkerProperties(properties);
    return Object.keys(cssProperties).length > 0 ? { [this.markerName]: cssProperties } : {};
  }

  private extractProperties(): Record<string, string> {
    const properties: Record<string, string> = {};

    Array.from(this.element.attributes).forEach((attr) => {
      properties[attr.name] = attr.value;
    });

    return properties;
  }

  private generateMarkerProperties(properties: Record<string, string>): Record<string, string> {
    const cssProperties: Record<string, string> = {};

    Object.entries(properties).forEach(([name, value]) => {
      switch (name) {
        case "svg:viewBox":
          cssProperties.viewBox = value;
          break;
        case "svg:d":
          cssProperties.d = value;
          break;
      }
    });

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "draw:marker");
  }
}
