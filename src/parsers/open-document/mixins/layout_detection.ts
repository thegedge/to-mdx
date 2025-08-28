import { convertCmToPercent, type Maybe } from "../../../utils.ts";
import type { BaseElement } from "../../base_element.ts";
import { Notes } from "../presentation/notes.ts";

export class LayoutDetection {
  private element: BaseElement;

  constructor(element: BaseElement) {
    this.element = element;
  }

  get layoutClass(): Maybe<string> {
    if (!this.element.context("options")?.useHeuristics) {
      return null;
    }

    if (this.needsPositioning) {
      return "blank";
    }

    const centeringLayoutClass = this.centeringLayoutClass();
    if (centeringLayoutClass) {
      return centeringLayoutClass;
    }

    return null;
  }

  private centeringLayoutClass(): Maybe<string> {
    const parentNode = this.element.parentNode;
    if (!parentNode) {
      return null;
    }

    // Only consider it "mostly centered" if there's just one frame
    const siblingFrames = Array.from(parentNode).filter(
      // TODO better way of isolating important siblings, that will have content
      (child) => !(child instanceof Notes) && !child.empty(),
    );
    if (siblingFrames.length > 1) {
      return null;
    }

    const positioningStyle = this.generatePositioningStyleObject();
    const leftPercent = parseFloat(String(positioningStyle.left));
    const topPercent = parseFloat(String(positioningStyle.top));
    const widthPercent = parseFloat(String(positioningStyle.width));
    const heightPercent = parseFloat(String(positioningStyle.height));

    const centerX = leftPercent + 0.5 * widthPercent;
    const centerY = topPercent + 0.5 * heightPercent;

    const horizontally = centerX > 45.0 && centerX < 65.0;
    const vertically = centerY > 45.0 && centerY < 65.0;
    const fullWidth = widthPercent > 95.0;
    const fullHeight = heightPercent > 95.0;

    if (horizontally && vertically) {
      if (fullHeight || fullWidth) {
        return "centered blank";
      }
      return "centered";
    }

    return null;
  }

  get needsPositioning(): boolean {
    return this.hasPositioning() && !this.isTitleOrSubtitle() && !this.centeringLayoutClass();
  }

  generatePositioningStyleObject(): Record<string, Maybe<string | number>> {
    if (!this.hasPositioning() || !this.element.context("pageDimensions")) {
      return {};
    }

    const x = this.element.attr("svg:x");
    const y = this.element.attr("svg:y");
    const svgWidth = this.element.attr("svg:width");
    const svgHeight = this.element.attr("svg:height");
    const { width: pageWidth = 0, height: pageHeight = 0 } = this.element.context("pageDimensions") ?? {};

    let left = convertCmToPercent(x, pageWidth);
    let top = convertCmToPercent(y, pageHeight);
    let width = convertCmToPercent(svgWidth, pageWidth);
    let height = convertCmToPercent(svgHeight, pageHeight);

    const styles = this.element.context("styles");
    const styleName = this.element.attr("draw:style-name");
    if (styleName) {
      const properties = styles.properties(styleName);

      const paddingTop = parseFloat(properties["padding-top"] ?? "0");
      const paddingLeft = parseFloat(properties["padding-left"] ?? "0");
      const paddingBottom = parseFloat(properties["padding-bottom"] ?? "0");
      const paddingRight = parseFloat(properties["padding-right"] ?? "0");

      // The width/height attributes specificy a bounding box, which incorporates padding, so we may need to remove it

      if (left && paddingLeft) {
        left = `${(parseFloat(left) - paddingLeft).toFixed(1)}%`;
      }

      if (top && paddingTop) {
        top = `${(parseFloat(top) - paddingTop).toFixed(1)}%`;
      }

      if (width && paddingLeft && paddingRight) {
        width = `${(parseFloat(width) + paddingRight + paddingLeft).toFixed(1)}%`;
      }

      if (height && paddingTop && paddingBottom) {
        height = `${(parseFloat(height) + paddingBottom + paddingTop).toFixed(1)}%`;
      }
    }

    return {
      position: "absolute",
      zIndex: 1,
      left,
      top,
      width,
      height,
    };
  }

  private isTitleOrSubtitle(): boolean {
    if (!("presentationClass" in this.element)) {
      return false;
    }

    return this.element.presentationClass === "title" || this.element.presentationClass === "subtitle";
  }

  private hasPositioning(): boolean {
    const x = this.element.attr("svg:x");
    const y = this.element.attr("svg:y");
    const width = this.element.attr("svg:width");
    const height = this.element.attr("svg:height");
    return !!(x || y || width || height);
  }
}
