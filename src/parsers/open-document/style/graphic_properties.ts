import { convertCmToPercent } from "../../../utils.ts";
import { BaseElement } from "../../base_element.ts";

export class GraphicProperties extends BaseElement {
  toMdx(): string {
    throw new Error("Not implemented");
  }

  toString(): string {
    throw new Error("Not implemented");
  }

  toCss(): Record<string, string | undefined> {
    const cssProperties: Record<string, string | undefined> = {};
    const styleFamily = (this.context("style_family") as string) || "";

    Array.from(this.element.attributes).forEach((attr) => {
      const { name, value } = attr;
      switch (name) {
        case "draw:fill-color":
          if (styleFamily === "graphic") {
            cssProperties.fill = value;
          } else {
            const opacity = this.element.getAttribute("draw:opacity");
            if (opacity) {
              cssProperties["background-color"] = `rgb(from ${value} r g b / ${opacity})`;
            } else {
              cssProperties["background-color"] = value;
            }
          }
          break;
        case "draw:fill":
          if (value === "none") {
            cssProperties.fill = "none";
            cssProperties["background-color"] = "transparent";
          } else if (value === "bitmap") {
            cssProperties["background-repeat"] = "no-repeat";
          }
          break;
        case "draw:opacity":
          if (styleFamily === "graphic") {
            cssProperties["fill-opacity"] = value;
          }
          break;
        case "draw:shadow":
          if (value === "visible") {
            const shadowOffsetX = this.attr("draw:shadow-offset-x") || "0cm";
            const shadowOffsetY = this.attr("draw:shadow-offset-y") || "0cm";
            const shadowColor = this.attr("draw:shadow-color") || "#000000";
            const shadowOpacity = this.attr("draw:shadow-opacity") || "100%";

            const offsetXPx = Math.round(parseFloat(shadowOffsetX) * 37.8);
            const offsetYPx = Math.round(parseFloat(shadowOffsetY) * 37.8);
            const opacityDecimal = parseFloat(shadowOpacity) / 100;

            const shadowColorWithOpacity = shadowColor.replace(/#([0-9a-fA-F]{6})/, (_match, hex: string) => {
              const r = parseInt(hex.slice(0, 2), 16);
              const g = parseInt(hex.slice(2, 4), 16);
              const b = parseInt(hex.slice(4, 6), 16);
              return `rgba(${r}, ${g}, ${b}, ${opacityDecimal})`;
            });

            cssProperties["text-shadow"] = `${offsetXPx}px ${offsetYPx}px ${shadowColorWithOpacity}`;
          }
          break;
        case "draw:stroke":
          // TODO: Handle this
          break;
        case "draw:textarea-vertical-align":
          if (!styleFamily.startsWith("table")) {
            cssProperties.display = "flex";
            cssProperties["flex-direction"] = "column";
            switch (value) {
              case "middle":
                cssProperties["justify-content"] = "center";
                break;
              case "bottom":
                cssProperties["justify-content"] = "end";
                break;
              // "top" is default, no need to set
            }
          }
          break;
        case "svg:stroke-color":
          if (styleFamily === "graphic") {
            cssProperties.stroke = value;
          } else {
            cssProperties["border-color"] = value;
          }
          break;
        case "svg:stroke-width": {
          const strokeWidth = value;
          if (Math.sign(parseFloat(strokeWidth)) !== 0) {
            if (styleFamily === "graphic") {
              if (typeof value === "string" && value.endsWith("cm")) {
                cssProperties["stroke-width"] = parseFloat(value).toFixed(4);
              } else {
                cssProperties["stroke-width"] = strokeWidth;
              }
            } else {
              cssProperties["border-width"] = strokeWidth;
            }
          }
          break;
        }
        case "fo:padding-top":
          cssProperties["padding-top"] = convertCmToPercent(value, this.context("pageDimensions")?.height) ?? undefined;
          break;
        case "fo:padding-bottom":
          cssProperties["padding-bottom"] =
            convertCmToPercent(value, this.context("pageDimensions")?.height) ?? undefined;
          break;
        case "fo:padding-left":
          cssProperties["padding-left"] = convertCmToPercent(value, this.context("pageDimensions")?.width) ?? undefined;
          break;
        case "fo:padding-right":
          cssProperties["padding-right"] =
            convertCmToPercent(value, this.context("pageDimensions")?.width) ?? undefined;
          break;
      }
    });

    return cssProperties;
  }

  static {
    BaseElement.registerFor.call(this, "style:graphic-properties", "loext:graphic-properties");
  }
}
