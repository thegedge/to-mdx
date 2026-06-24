import assert from "node:assert/strict";
import { test } from "node:test";
import type { ShapeInfoArchive, ShapeStyleArchive, StrokePatternArchive } from "../types.ts";
import { buildPathData, effectiveShapeProps, shapeBorderRadius, strokeDasharray, svgPath } from "./shapes.ts";

/** A two-point horizontal line in a frame, with optional rotation. */
function line(frame: { x: number; y: number; width: number; height: number; angle?: number }): ShapeInfoArchive {
  return {
    super: {
      super: { geometry: { position: { x: frame.x, y: frame.y }, size: { width: frame.width, height: frame.height }, angle: frame.angle ?? 0 } },
      pathsource: {
        bezierPathSource: {
          naturalSize: { width: 100, height: 0 },
          path: {
            elements: [
              { type: 1, points: [{ x: 0, y: 0 }] },
              { type: 2, points: [{ x: 100, y: 0 }] },
            ],
          },
        },
      },
    },
  } as unknown as ShapeInfoArchive;
}

/** Parses the absolute points out of a `M x y L x y …` path data string. */
function points(d: string): Array<{ x: number; y: number }> {
  return [...d.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

const STROKE_STYLE: ShapeStyleArchive = {
  shapeProperties: { stroke: { color: { model: 1, r: 1, g: 0, b: 0 }, width: 3 } },
} as unknown as ShapeStyleArchive;

test("buildPathData maps a 0deg line straight across the frame", () => {
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 100, y: 0 }] },
    ],
    { x: 100, y: 200, width: 716, height: 0, angle: 0 },
  );

  const [a, b] = points(d);
  assert.deepEqual(a, { x: 100, y: 200 });
  assert.deepEqual(b, { x: 816, y: 200 });
});

test("buildPathData rotates a 90deg line to near-vertical", () => {
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 100, y: 0 }] },
    ],
    { x: 100, y: 200, width: 716, height: 0, angle: 90 },
  );

  const [a, b] = points(d);
  assert.ok(Math.abs(a.x - b.x) < 0.01, `x's should be ~equal: ${a.x} vs ${b.x}`);
  assert.ok(Math.abs(Math.abs(b.y - a.y) - 716) < 0.01, `y's should differ by ~716: got ${Math.abs(b.y - a.y)}`);
});

test("buildPathData emits a cubic bezier (C) for a curve element (type 4), baking all three points", () => {
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      {
        type: 4,
        points: [
          { x: 10, y: 50 },
          { x: 90, y: 50 },
          { x: 100, y: 100 },
        ],
      },
    ],
    { x: 0, y: 0, width: 100, height: 100, angle: 0 },
  );

  assert.equal(d, "M 0 0 C 10 50 90 50 100 100");
});

test("buildPathData falls back to a lineTo when a curve element has fewer than three points", () => {
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 4, points: [{ x: 100, y: 100 }] },
    ],
    { x: 0, y: 0, width: 100, height: 100, angle: 0 },
  );

  assert.equal(d, "M 0 0 L 100 100");
});

test("buildPathData renders a closed four-curve circle as cubic beziers, not straight segments", () => {
  // A circle approximated by four cubic beziers (one per quadrant) around a
  // 100x100 box: each curve's points are [control1, control2, endpoint].
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 50, y: 0 }] },
      { type: 4, points: [{ x: 78, y: 0 }, { x: 100, y: 22 }, { x: 100, y: 50 }] },
      { type: 4, points: [{ x: 100, y: 78 }, { x: 78, y: 100 }, { x: 50, y: 100 }] },
      { type: 4, points: [{ x: 22, y: 100 }, { x: 0, y: 78 }, { x: 0, y: 50 }] },
      { type: 4, points: [{ x: 0, y: 22 }, { x: 22, y: 0 }, { x: 50, y: 0 }] },
      { type: 5, points: [] },
    ],
    { x: 0, y: 0, width: 100, height: 100, angle: 0 },
  );

  assert.equal((d.match(/C /g) ?? []).length, 4);
  assert.doesNotMatch(d, / L /);
  assert.match(d, /Z$/);
});

test("buildPathData emits Z for a close element", () => {
  const d = buildPathData(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 10, y: 0 }] },
      { type: 5, points: [] },
    ],
    { x: 0, y: 0, width: 10, height: 10, angle: 0 },
  );

  assert.equal(d, "M 0 0 L 10 0 Z");
});

test("svgPath yields a path with the resolved stroke color and width", () => {
  const path = svgPath(line({ x: 100, y: 200, width: 716, height: 0 }), STROKE_STYLE);
  assert.ok(path);
  assert.equal(path.stroke, "#ff0000");
  assert.equal(path.strokeWidth, 3);
  assert.equal(path.fill, undefined);
  assert.match(path.d, /^M 100 200 L 816 200$/);
});

test("svgPath defaults to currentColor width 2 when no style resolves", () => {
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), undefined);
  assert.ok(path);
  assert.equal(path.stroke, "currentColor");
  assert.equal(path.strokeWidth, 2);
});

test("svgPath renders a currentColor outline when the style resolves to nothing visible", () => {
  const emptyFrame: ShapeStyleArchive = { shapeProperties: {} } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), emptyFrame);
  assert.ok(path);
  assert.equal(path.stroke, "currentColor");
  assert.equal(path.strokeWidth, 2);
  assert.equal(path.fill, "none");
});

test("svgPath renders a currentColor outline when the stroke pattern is the empty pattern and there is no fill", () => {
  const noStroke: ShapeStyleArchive = {
    shapeProperties: { stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 1, pattern: { type: 2 } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), noStroke);
  assert.ok(path);
  assert.equal(path.stroke, "currentColor");
  assert.equal(path.fill, "none");
});

test("svgPath emits a fill-only path when the style has a fill but no stroke", () => {
  const fillStyle: ShapeStyleArchive = {
    shapeProperties: { fill: { color: { model: 1, r: 0, g: 0, b: 1 } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), fillStyle);
  assert.ok(path);
  assert.equal(path.fill, "#0000ff");
  assert.equal(path.stroke, "none");
});

test("svgPath flags arrowheads from head/tail line-ends", () => {
  const arrowStyle: ShapeStyleArchive = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2 },
      tailLineEnd: { identifier: "Arrow" },
    },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), arrowStyle);
  assert.ok(path);
  assert.equal(path.markerEnd, true);
  assert.equal(path.markerStart, undefined);
});

test("svgPath returns undefined for a shape with no bezier path", () => {
  const noPath = { super: { super: {} } } as unknown as ShapeInfoArchive;
  assert.equal(svgPath(noPath, STROKE_STYLE), undefined);
});

test("effectiveShapeProps reads stroke/fill from the nested super when the outer shapeProperties is empty", () => {
  const style = {
    shapeProperties: {},
    super: {
      shapeProperties: { stroke: { color: { model: 1, r: 0.13, g: 0.2, b: 0.45, a: 1 }, width: 5 } },
    },
  } as unknown as ShapeStyleArchive;

  const props = effectiveShapeProps(style);
  assert.equal(props?.stroke?.width, 5);
  assert.equal(props?.stroke?.color?.r, 0.13);
});

test("svgPath resolves the lifeline stroke color and width from the nested super style", () => {
  const lifeline = {
    shapeProperties: {},
    super: {
      shapeProperties: {
        stroke: {
          color: { model: 1, r: 0.13, g: 0.2, b: 0.45, a: 1 },
          width: 5,
          cap: 1,
          pattern: { type: 0, count: 2, phase: 0, pattern: [0.001, 2, 0, 0, 0, 0] },
        },
      },
    },
  } as unknown as ShapeStyleArchive;

  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), lifeline);
  assert.ok(path);
  assert.equal(path.stroke, "#213373"); // rgb(0.13,0.20,0.45) → hex
  assert.equal(path.strokeWidth, 5);
  assert.equal(path.strokeDasharray, "0.005,10");
  assert.equal(path.strokeLinecap, "round");
});

test("strokeDasharray scales the first `count` pattern values by the stroke width", () => {
  const pattern = { type: 0, count: 2, pattern: [0.001, 2, 0, 0] } as unknown as StrokePatternArchive;
  assert.equal(strokeDasharray(pattern, 5), "0.005,10");
});

test("strokeDasharray returns undefined for a solid-pattern stroke", () => {
  const solid = { type: 1, count: 0, pattern: [] } as unknown as StrokePatternArchive;
  assert.equal(strokeDasharray(solid, 5), undefined);
});

test("svgPath emits no dasharray for a solid stroke", () => {
  const solidStroke = {
    shapeProperties: { stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2, pattern: { type: 1 } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), solidStroke);
  assert.ok(path);
  assert.equal(path.strokeDasharray, undefined);
  assert.equal(path.strokeLinecap, undefined);
});

test("svgPath approximates an image fill with its tint color", () => {
  const iconFill = {
    shapeProperties: { fill: { image: { tint: { model: 1, r: 1, g: 0, b: 0, a: 1 } } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), iconFill);
  assert.ok(path);
  assert.equal(path.fill, "#ff0000");
});

test("svgPath uses a solid fill color directly", () => {
  const solidFill = {
    shapeProperties: { fill: { color: { model: 1, r: 0, g: 1, b: 0, a: 1 } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), solidFill);
  assert.ok(path);
  assert.equal(path.fill, "#00ff00");
});

test("svgPath carries fillOpacity and strokeOpacity from translucent colors", () => {
  const translucent = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 0, a: 0.5 }, width: 2 },
      fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 0.25 } },
    },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), translucent);
  assert.ok(path);
  assert.equal(path.strokeOpacity, 0.5);
  assert.equal(path.fillOpacity, 0.25);
});

test("shapeBorderRadius expresses a rounded-rect scalar as a percent of the smaller natural side", () => {
  const roundedRect = {
    super: {
      pathsource: {
        scalarPathSource: { type: 0, scalar: 15, naturalSize: { width: 168, height: 200 } },
      },
    },
  } as unknown as ShapeInfoArchive;
  // 15 / min(168, 200) * 100 = 8.928… → "8.9%"
  assert.equal(shapeBorderRadius(roundedRect), "8.9%");
});

test("shapeBorderRadius returns undefined when the shape has no scalar path source", () => {
  const sharp = { super: { pathsource: { bezierPathSource: {} } } } as unknown as ShapeInfoArchive;
  assert.equal(shapeBorderRadius(sharp), undefined);
});

test("shapeBorderRadius returns undefined for a zero corner radius", () => {
  const zero = {
    super: { pathsource: { scalarPathSource: { type: 0, scalar: 0, naturalSize: { width: 100, height: 100 } } } },
  } as unknown as ShapeInfoArchive;
  assert.equal(shapeBorderRadius(zero), undefined);
});

test("svgPath flags only markerStart when head is an arrow and tail is none", () => {
  const arrow = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2 },
      headLineEnd: { identifier: "simple arrow", isFilled: true },
      tailLineEnd: { identifier: "none" },
    },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), arrow);
  assert.ok(path);
  assert.equal(path.markerStart, true);
  assert.equal(path.markerEnd, undefined);
});
