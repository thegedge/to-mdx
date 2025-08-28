import dedent from "dedent-js";
import type { Style } from "../../../styles.ts";
import { compact, convertCmToPercent } from "../../../utils.ts";
import { BaseElement } from "../../base_element.ts";

export abstract class SvgElement extends BaseElement {
  wrapWithSvgTag(content: string, style?: Style): string {
    const [_x, _y, w, h] = this.viewBox;
    const attributes = [`xmlns="http://www.w3.org/2000/svg"`, `viewBox="0 0 ${w} ${h}"`];

    if (style) {
      attributes.push(`className="w-full h-full ${style}"`);
    }

    const name = this.attr("draw:name");
    if (name) {
      attributes.push(`data-name="${name}"`);
    }

    return dedent`
      <svg ${attributes.join(" ")}>
        ${content}
      </svg>
    `;
  }

  get viewBox(): [number, number, number, number] {
    const viewBoxAttr = this.attr("svg:viewBox");
    if (viewBoxAttr && viewBoxAttr !== "0 0 0 0") {
      return viewBoxAttr.split(" ").map(Number) as [number, number, number, number];
    }

    if (this.width && this.height) {
      return [0, 0, Math.round(parseFloat(this.width)), Math.round(parseFloat(this.height))];
    }

    return [0, 0, 1, 1]; // default to unit square
  }

  get x(): string | null {
    return this.attr("svg:x");
  }

  get y(): string | null {
    return this.attr("svg:y");
  }

  get width(): string | null {
    return this.attr("svg:width");
  }

  get height(): string | null {
    return this.attr("svg:height");
  }

  hasPositioning(): boolean {
    return !!(this.x || this.y || this.width || this.height);
  }

  generatePositioningStyleObject(): Record<string, string | number> {
    if (!this.hasPositioning()) {
      return {};
    }

    const pageDimensions = this.context("pageDimensions");
    if (!pageDimensions) {
      throw new Error("Page dimensions not found");
    }

    const xPercent = convertCmToPercent(this.x, pageDimensions.width);
    const yPercent = convertCmToPercent(this.y, pageDimensions.height);
    const widthPercent = convertCmToPercent(this.width, pageDimensions.width);
    const heightPercent = convertCmToPercent(this.height, pageDimensions.height);

    const styles: Record<string, string | number> = {
      position: "absolute",
      zIndex: 1,
    };

    if (xPercent) styles.left = xPercent;
    if (yPercent) styles.top = yPercent;
    if (widthPercent) styles.width = widthPercent;
    if (heightPercent) styles.height = heightPercent;

    return styles;
  }

  generateCombinedStyleObject(): Record<string, string | number> {
    return compact({
      ...this.generatePositioningStyleObject(),
      ...this.generateTransformStyles(),
    });
  }

  private generateTransformStyles(): Record<string, string> {
    const drawTransform = this.attr("draw:transform");
    if (!drawTransform) {
      return {};
    }

    const styles: Record<string, string> = {};
    const transforms: string[] = [];

    // Simple transform parsing (more sophisticated than original but simplified)
    const transformPattern = /(\w+)\s*\(([^)]+)\)/g;
    const matches = Array.from(drawTransform.matchAll(transformPattern));

    // CSS evaluates transforms right-to-left, OpenDocument left-to-right
    matches.reverse().forEach(([, functionName, params]) => {
      const func = functionName.toLowerCase();
      switch (func) {
        case "rotate": {
          const angle = parseFloat(params.trim());
          if (Math.sign(angle) != 0) {
            transforms.push(`rotate(-${angle + 2 * Math.PI}rad)`);
          }
          break;
        }
        case "scale": {
          const coords = params.trim().split(/\s+/);
          if (coords.length >= 1) {
            const xScale = parseFloat(coords[0]);
            const yScale = coords[1] ? parseFloat(coords[1]) : xScale;
            transforms.push(`scale(${xScale}, ${yScale})`);
          }
          break;
        }
        case "translate": {
          const [x, y] = params.trim().split(/\s+/);
          const pageDimensions = this.context("pageDimensions");
          if (pageDimensions) {
            const xPercentage = convertCmToPercent(x, pageDimensions.width);
            const yPercentage = convertCmToPercent(y, pageDimensions.height);
            if (xPercentage) styles.left = xPercentage;
            if (yPercentage) styles.top = yPercentage;
          }
          break;
        }
        case "skewx": {
          const angle = parseFloat(params.trim());
          if (angle >= 1e-2) {
            transforms.push(`skewX(${angle}rad)`);
          }
          break;
        }
        case "skewy": {
          const angle = parseFloat(params.trim());
          if (angle >= 1e-2) {
            transforms.push(`skewY(${angle}rad)`);
          }
          break;
        }
      }
    });

    if (transforms.length > 0) {
      styles.transform = transforms.join(" ");
      styles.transformOrigin = "top left";
    }

    return styles;
  }
}
