import assert from "node:assert/strict";
import { test } from "node:test";
import type { ShapeInfoArchive, ShapeStyleArchive } from "../types.ts";
import { buildPathData, svgPath } from "./shapes.ts";

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

test("buildPathData approximates a curve element (type 4) as a lineTo to its endpoint", () => {
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

  assert.equal(d, "M 0 0 L 100 100");
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

test("svgPath skips a shape whose style has neither a visible stroke nor a fill", () => {
  const emptyFrame: ShapeStyleArchive = { shapeProperties: {} } as unknown as ShapeStyleArchive;
  assert.equal(svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), emptyFrame), undefined);
});

test("svgPath skips a shape whose stroke pattern is the empty pattern", () => {
  const noStroke: ShapeStyleArchive = {
    shapeProperties: { stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 1, pattern: { type: 2 } } },
  } as unknown as ShapeStyleArchive;
  assert.equal(svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), noStroke), undefined);
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
