import assert from "node:assert/strict";
import { test } from "node:test";
import type { ShapeInfoArchive, ShapeStyleArchive, StrokePatternArchive } from "../types.ts";
import { buildLocalPath, type DataNameMaps, effectiveShapeProps, shapeBorder, shapeBorderRadius, shapeBrushBorder, shapeOpacity, shapeTextShadow, strokeDasharray, svgPath } from "./shapes.ts";

/**
 * Applies an SVG `transform` (translate/rotate/scale, right-to-left as SVG does)
 * to a point, so a local path's corner can be checked against the old baked
 * absolute coordinate.
 */
function applyTransform(transform: string, p: { x: number; y: number }): { x: number; y: number } {
  let { x, y } = p;
  const ops = [...transform.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)].reverse();
  for (const [, op, argStr] of ops) {
    const args = argStr.trim().split(/[\s,]+/).map(Number);
    if (op === "translate") {
      x += args[0];
      y += args[1] ?? 0;
    } else if (op === "scale") {
      x *= args[0];
      y *= args[1] ?? args[0];
    } else {
      const [deg, cx = 0, cy = 0] = args;
      const a = (deg * Math.PI) / 180;
      const dx = x - cx;
      const dy = y - cy;
      x = cx + dx * Math.cos(a) - dy * Math.sin(a);
      y = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
  }
  return { x, y };
}

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

test("buildLocalPath places a 0deg line's local corners where the old baked path was", () => {
  const { localD, transform } = buildLocalPath(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 100, y: 0 }] },
    ],
    { x: 100, y: 200, width: 716, height: 0, angle: 0 },
  );

  // Local path starts at the origin; no rotation (0deg) so no rotate() in the transform.
  assert.equal(localD, "M 0 0 L 100 0");
  assert.doesNotMatch(transform, /rotate/);

  // The transformed corners land at the old absolute slide coordinates.
  const [a, b] = points(localD).map((p) => applyTransform(transform, p));
  assert.deepEqual({ x: Math.round(a.x), y: Math.round(a.y) }, { x: 100, y: 200 });
  assert.deepEqual({ x: Math.round(b.x), y: Math.round(b.y) }, { x: 816, y: 200 });
});

test("buildLocalPath scales by the curve's true bounds, not its endpoints (curve bulge included)", () => {
  // A cubic from (0,0) to (100,0) bulging down to y≈75; its endpoints are both y=0,
  // so endpoint-only bounds would be zero-height and over-scale the shape.
  const { transform } = buildLocalPath(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 4, points: [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }] },
    ],
    { x: 0, y: 0, width: 200, height: 150, angle: 0 },
  );
  // bounds 100×75 → scale 200/100, 150/75 = 2, 2 (not 2, 1 from a zero-height box).
  assert.match(transform, /scale\(2 2\)/);
});

test("buildLocalPath rotates via an explicit rotate() about the frame centre (90deg → near-vertical)", () => {
  const { localD, transform } = buildLocalPath(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 100, y: 0 }] },
    ],
    { x: 100, y: 200, width: 716, height: 0, angle: 90 },
  );

  assert.equal(localD, "M 0 0 L 100 0");
  // rotate(angle, cx, cy) with cx = frameW/2 = 358, cy = frameH/2 = 0. The Keynote
  // 90° (y-up, CCW) is negated to 270° for SVG's y-down, clockwise rotate().
  assert.match(transform, /rotate\(270 358 0\)/);

  const [a, b] = points(localD).map((p) => applyTransform(transform, p));
  assert.ok(Math.abs(a.x - b.x) < 0.01, `x's should be ~equal: ${a.x} vs ${b.x}`);
  assert.ok(Math.abs(Math.abs(b.y - a.y) - 716) < 0.01, `y's should differ by ~716: got ${Math.abs(b.y - a.y)}`);
});

test("buildLocalPath normalizes a path so its (endpoint) bounding box starts at (0,0), placement from the frame", () => {
  const { localD, transform } = buildLocalPath(
    [
      { type: 1, points: [{ x: 50, y: 60 }] },
      { type: 2, points: [{ x: 150, y: 60 }] },
    ],
    { x: 200, y: 300, width: 100, height: 0, angle: 0 },
  );

  // The source offset (50, 60) is normalized away; the local box starts at origin
  // and the frame origin (not the source coords) places it — matching the old baking.
  assert.equal(localD, "M 0 0 L 100 0");
  const a = applyTransform(transform, { x: 0, y: 0 });
  assert.deepEqual({ x: Math.round(a.x), y: Math.round(a.y) }, { x: 200, y: 300 });
});

test("buildLocalPath emits a local cubic bezier (C) for a curve element, with an identity transform", () => {
  const { localD, transform } = buildLocalPath(
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

  assert.equal(localD, "M 0 0 C 10 50 90 50 100 100");
  // frame origin (0,0), 0deg, frameW/boundsW = frameH/boundsH = 1 → no transform at all.
  assert.equal(transform, "");
});

test("buildLocalPath falls back to a lineTo when a curve element has fewer than three points", () => {
  const { localD } = buildLocalPath(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 4, points: [{ x: 100, y: 100 }] },
    ],
    { x: 0, y: 0, width: 100, height: 100, angle: 0 },
  );

  assert.equal(localD, "M 0 0 L 100 100");
});

test("buildLocalPath renders a closed four-curve circle as cubic beziers, not straight segments", () => {
  // A circle approximated by four cubic beziers (one per quadrant) around a
  // 100x100 box: each curve's points are [control1, control2, endpoint].
  const { localD } = buildLocalPath(
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

  assert.equal((localD.match(/C /g) ?? []).length, 4);
  assert.doesNotMatch(localD, / L /);
  assert.match(localD, /Z$/);
});

test("buildLocalPath emits Z for a close element", () => {
  const { localD } = buildLocalPath(
    [
      { type: 1, points: [{ x: 0, y: 0 }] },
      { type: 2, points: [{ x: 10, y: 0 }] },
      { type: 5, points: [] },
    ],
    { x: 0, y: 0, width: 10, height: 10, angle: 0 },
  );

  assert.equal(localD, "M 0 0 L 10 0 Z");
});

test("svgPath yields a path with the resolved stroke color and width", () => {
  const path = svgPath(line({ x: 100, y: 200, width: 716, height: 0 }), STROKE_STYLE);
  assert.ok(path);
  assert.equal(path.stroke, "#ff0000");
  assert.equal(path.strokeWidth, 3);
  assert.equal(path.fill, undefined);
  // Local path at the origin, positioned by the transform (not baked into `d`).
  assert.equal(path.localD, "M 0 0 L 100 0");
  assert.equal(path.transform, "translate(100 200) scale(7.16 1)");
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

test("shapeBorder renders a shape stroke as a CSS border shorthand (solid, dashed, or none)", () => {
  const solid = {
    shapeProperties: { stroke: { color: { model: 1, r: 1, g: 0, b: 0 }, width: 3 } },
  } as unknown as ShapeStyleArchive;
  assert.equal(shapeBorder(solid), "3px solid #ff0000");

  const dashed = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2, pattern: { type: 0, count: 2, phase: 0, pattern: [0.001, 2, 0, 0] } },
    },
  } as unknown as ShapeStyleArchive;
  assert.match(shapeBorder(dashed) ?? "", /^2px dashed #000000$/);

  // No stroke (empty shapeProperties) and the empty stroke pattern both yield no border.
  assert.equal(shapeBorder({ shapeProperties: {} } as unknown as ShapeStyleArchive), undefined);
  const emptyPattern = {
    shapeProperties: { stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 1, pattern: { type: 2 } } },
  } as unknown as ShapeStyleArchive;
  assert.equal(shapeBorder(emptyPattern), undefined);
});

test("shapeBrushBorder resolves a smart (brush) stroke to {color,width}, and is mutually exclusive with shapeBorder", () => {
  const smart = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 1 }, width: 4, smartStroke: { strokeName: "Pen" } },
    },
  } as unknown as ShapeStyleArchive;
  assert.deepEqual(shapeBrushBorder(smart), { color: "#0000ff", width: 4 });
  // A smart stroke never also yields a flat CSS border (no double border).
  assert.equal(shapeBorder(smart), undefined);

  // A plain stroke yields a CSS border but no brush border.
  const plain = {
    shapeProperties: { stroke: { color: { model: 1, r: 1, g: 0, b: 0 }, width: 3 } },
  } as unknown as ShapeStyleArchive;
  assert.equal(shapeBrushBorder(plain), undefined);
  assert.equal(shapeBorder(plain), "3px solid #ff0000");

  // No stroke at all yields neither.
  assert.equal(shapeBrushBorder({ shapeProperties: {} } as unknown as ShapeStyleArchive), undefined);
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
  // tailLineEnd is at the path start (line runs tail → head).
  assert.equal(path.markerStart, true);
  assert.equal(path.markerEnd, undefined);
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

test("svgPath approximates an image fill with no backing imagedata as its tint color", () => {
  const iconFill = {
    shapeProperties: { fill: { image: { tint: { model: 1, r: 1, g: 0, b: 0, a: 1 } } } },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), iconFill);
  assert.ok(path);
  assert.equal(path.fill, "#ff0000");
  assert.equal(path.imageFill, undefined);
});

/** Builds an image-fill style whose `imagedata.identifier` resolves to a file, with the given tint. */
function imageFillStyle(id: number, tint?: { r: number; g: number; b: number; a?: number }): ShapeStyleArchive {
  return {
    shapeProperties: { fill: { image: { imagedata: { identifier: BigInt(id) }, ...(tint ? { tint: { model: 1, ...tint } } : {}) } } },
  } as unknown as ShapeStyleArchive;
}

const VIRGO_DATA: DataNameMaps = { fileNames: new Map([[4713, "universe-1050036_1280.jpg"]]), info: new Map() };

test("svgPath resolves an image fill to imageFill (fileName + tint), not a solid fill", () => {
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), imageFillStyle(4713, { r: 0, g: 0, b: 0, a: 0.5 }), VIRGO_DATA);
  assert.ok(path);
  assert.deepEqual(path.imageFill, { fileName: "universe-1050036_1280.jpg", tintColor: "#000000", tintOpacity: 0.5 });
  assert.equal(path.fill, undefined);
  // The image paints the shape, so the absent stroke falls back to "none", not a default outline.
  assert.equal(path.stroke, "none");
});

test("svgPath drops a fully-transparent (alpha 0) image-fill tint, keeping the fileName", () => {
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), imageFillStyle(4713, { r: 0, g: 0, b: 0, a: 0 }), VIRGO_DATA);
  assert.ok(path);
  assert.deepEqual(path.imageFill, { fileName: "universe-1050036_1280.jpg" });
  assert.equal(path.imageFill?.tintOpacity, undefined);
  assert.equal(path.imageFill?.tintColor, undefined);
});

test("svgPath falls back to a tint-color solid fill when an image fill's data id cannot resolve", () => {
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), imageFillStyle(9999, { r: 1, g: 0, b: 0, a: 1 }), VIRGO_DATA);
  assert.ok(path);
  assert.equal(path.imageFill, undefined);
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

test("svgPath carries a translucent shapeProperties.opacity (rounded), opaque/absent emits none", () => {
  const translucent = {
    shapeProperties: { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, opacity: 0.700942873954773 },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), translucent);
  assert.ok(path);
  assert.equal(path.opacity, 0.701);

  const opaque = {
    shapeProperties: { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, opacity: 1 },
  } as unknown as ShapeStyleArchive;
  assert.equal(svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), opaque)?.opacity, undefined);

  const absent = {
    shapeProperties: { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } } },
  } as unknown as ShapeStyleArchive;
  assert.equal(svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), absent)?.opacity, undefined);
});

test("shapeOpacity reads a translucent opacity that sits beside the fill on a nested super link", () => {
  const style = {
    shapeProperties: {},
    super: { shapeProperties: { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, opacity: 0.7 } },
  } as unknown as ShapeStyleArchive;
  assert.equal(shapeOpacity(style), 0.7);
});

test("shapeTextShadow maps an enabled drop shadow to a CSS text-shadow (y-down offset, combined alpha)", () => {
  const style = {
    shapeProperties: {
      shadow: { color: { model: 1, r: 0, g: 0, b: 0, a: 1 }, angle: 90, offset: 2, radius: 16, opacity: 1, isEnabled: true, type: 0 },
    },
  } as unknown as ShapeStyleArchive;
  // angle 90 → dx = cos(90)·2 ≈ 0, dy = -sin(90)·2 = -2; radius 16 → blur; opaque black → hex.
  assert.equal(shapeTextShadow(style), "0px -2px 16px #000000");
});

test("shapeTextShadow finds a shadow-only super link that effectiveShapeProps skips, and combines alpha into rgba", () => {
  const style = {
    shapeProperties: { shrinkToFit: true },
    super: {
      shapeProperties: {
        shadow: { color: { model: 1, r: 0, g: 0, b: 0, a: 0.5 }, angle: 315, offset: 4, radius: 8, opacity: 0.5, isEnabled: true },
      },
    },
  } as unknown as ShapeStyleArchive;
  // effectiveShapeProps returns undefined here (no fill/stroke/line-end on either link).
  assert.equal(effectiveShapeProps(style), undefined);
  // angle 315 → dx = cos(315)·4 ≈ 2.83, dy = -sin(315)·4 ≈ 2.83 (bottom-right); alpha 0.5·0.5 = 0.25.
  assert.equal(shapeTextShadow(style), "2.83px 2.83px 8px rgba(0, 0, 0, 0.25)");
});

test("shapeTextShadow returns undefined for an empty, disabled, or absent shadow", () => {
  const empty = { shapeProperties: { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, shadow: {} } } as unknown as ShapeStyleArchive;
  assert.equal(shapeTextShadow(empty), undefined);

  const disabled = {
    shapeProperties: { shadow: { color: { model: 1, r: 0, g: 0, b: 0, a: 1 }, offset: 2, radius: 16, isEnabled: false } },
  } as unknown as ShapeStyleArchive;
  assert.equal(shapeTextShadow(disabled), undefined);

  assert.equal(shapeTextShadow(undefined), undefined);
});

test("shapeBorderRadius expresses a rounded-rect scalar as a px length (uniform corners)", () => {
  const roundedRect = {
    super: {
      pathsource: {
        scalarPathSource: { type: 0, scalar: 15, naturalSize: { width: 168, height: 200 } },
      },
    },
  } as unknown as ShapeInfoArchive;
  assert.equal(shapeBorderRadius(roundedRect), "15px");
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

test("svgPath flags only markerEnd when head is an arrow and tail is none", () => {
  const arrow = {
    shapeProperties: {
      stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2 },
      headLineEnd: { identifier: "simple arrow", isFilled: true },
      tailLineEnd: { identifier: "none" },
    },
  } as unknown as ShapeStyleArchive;
  const path = svgPath(line({ x: 0, y: 0, width: 100, height: 0 }), arrow);
  assert.ok(path);
  // headLineEnd (the arrowhead) is at the path end.
  assert.equal(path.markerEnd, true);
  assert.equal(path.markerStart, undefined);
});
