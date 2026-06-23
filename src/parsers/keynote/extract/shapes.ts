import type { SvgPath } from "../model.ts";
import type {
  BezierPathSourceArchive,
  Color,
  PathElement,
  ShapeInfoArchive,
  ShapeStyleArchive,
  StrokeArchive,
} from "../types.ts";
import { colorToHex } from "./style.ts";

/** A drawable's frame in slide points, including its rotation. */
interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

/** `TSP.Path.ElementType` discriminators used to translate a path to SVG commands. */
const ELEMENT_MOVE_TO = 1;
const ELEMENT_CURVE_TO = 4;
const ELEMENT_CLOSE = 5;

/** `TSD.StrokePatternArchive.StrokePatternType.TSDEmptyPattern` — an explicit "no line". */
const EMPTY_STROKE_PATTERN = 2;

/** Stroke used when a shape has a path but no resolvable style, so lines still show. */
const DEFAULT_STROKE = "currentColor";
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Turns a no-text shape into one SVG path baked into absolute slide coordinates.
 * A shape with a drawable path ALWAYS renders: when its style is missing or
 * resolves to nothing visible we fall back to a plain outline (see resolveStyle).
 * Returns undefined only when the shape carries no drawable path at all.
 */
export function svgPath(shape: ShapeInfoArchive, style: ShapeStyleArchive | undefined): SvgPath | undefined {
  const bezier = bezierSource(shape);
  const elements = bezier?.path?.elements;
  if (!bezier || !elements?.length) return undefined;

  const frame = shapeFrame(shape);
  const d = buildPathData(elements, frame);
  if (!d) return undefined;

  return { d, ...resolveStyle(style), ...arrowFlags(style) };
}

/**
 * Builds an SVG `d` string from path elements, baking each point into absolute
 * slide coordinates: scale the path's own bounding box to the frame size, rotate
 * around the frame centre by the frame's angle, then translate by the frame
 * origin. (Keynote's `naturalSize` mirrors the frame size, not the path's
 * coordinate space, so the path bounds are the right reference.) A cubic-bezier
 * element (type 4) carries its two control points and endpoint as `[c1, c2, end]`,
 * all baked through the same pipeline and emitted as an SVG `C`; a malformed curve
 * with fewer than three points falls back to a straight segment to its last point.
 */
export function buildPathData(elements: PathElement[], frame: Frame): string {
  const bounds = pathBounds(elements);
  const commands: string[] = [];

  for (const element of elements) {
    if (element.type === ELEMENT_CLOSE) {
      commands.push("Z");
      continue;
    }
    if (element.type === ELEMENT_CURVE_TO && element.points.length >= 3) {
      const [c1, c2, end] = element.points;
      const [c1x, c1y] = toSlidePoint(c1.x, c1.y, bounds, frame);
      const [c2x, c2y] = toSlidePoint(c2.x, c2.y, bounds, frame);
      const [ex, ey] = toSlidePoint(end.x, end.y, bounds, frame);
      commands.push(`C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(ex)} ${round(ey)}`);
      continue;
    }
    const point = element.points.at(-1);
    if (!point) continue;
    const [x, y] = toSlidePoint(point.x, point.y, bounds, frame);
    commands.push(`${element.type === ELEMENT_MOVE_TO ? "M" : "L"} ${round(x)} ${round(y)}`);
  }

  return commands.join(" ");
}

/** Bounding box of a path's drawn (endpoint) coordinates. */
interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function pathBounds(elements: PathElement[]): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const element of elements) {
    const point = element.points.at(-1);
    if (!point) continue;
    xs.push(point.x);
    ys.push(point.y);
  }
  if (xs.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function toSlidePoint(lx: number, ly: number, bounds: Bounds, frame: Frame): [number, number] {
  const fx = bounds.width ? ((lx - bounds.minX) * frame.width) / bounds.width : 0;
  const fy = bounds.height ? ((ly - bounds.minY) * frame.height) / bounds.height : 0;

  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const a = (frame.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const rx = cx + (fx - cx) * cos - (fy - cy) * sin;
  const ry = cy + (fx - cx) * sin + (fy - cy) * cos;

  return [frame.x + rx, frame.y + ry];
}

/** Reads the shape's frame geometry (position, size, angle) from its drawable super chain. */
function shapeFrame(shape: ShapeInfoArchive): Frame {
  const geometry = shape.super?.super?.geometry;
  return {
    x: geometry?.position?.x ?? 0,
    y: geometry?.position?.y ?? 0,
    width: geometry?.size?.width ?? 0,
    height: geometry?.size?.height ?? 0,
    angle: geometry?.angle ?? 0,
  };
}

/** The shape's bezier path, including the one nested under a connection line. */
function bezierSource(shape: ShapeInfoArchive): BezierPathSourceArchive | undefined {
  const source = shape.super?.pathsource;
  return source?.bezierPathSource ?? source?.connectionLinePathSource?.super;
}

/**
 * Resolves stroke/fill from the shape style. Always returns a drawable result:
 * when the style is missing, has no shapeProperties, or resolves to neither a
 * visible stroke nor a fill, it falls back to a plain currentColor outline
 * (width 2, fill none) so a shape with a path stays visible.
 *
 * NOTE: a shape's real stroke/fill COLORS are unrecoverable here — they can live
 * in a style archive lost to a dropped .iwa chunk — so this fallback is an
 * outline a human can recolor, not the shape's original styling.
 */
function resolveStyle(style: ShapeStyleArchive | undefined): Pick<SvgPath, "stroke" | "strokeWidth" | "fill"> {
  const properties = style?.shapeProperties;
  const stroke = properties ? visibleStroke(properties.stroke) : undefined;
  const fill = properties ? fillColor(properties.fill?.color) : undefined;
  if (!stroke && !fill) return { stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH, fill: "none" };

  return {
    stroke: stroke?.color ?? (fill ? "none" : DEFAULT_STROKE),
    strokeWidth: stroke?.width ?? DEFAULT_STROKE_WIDTH,
    ...(fill ? { fill } : {}),
  };
}

function visibleStroke(stroke: StrokeArchive | undefined): { color: string; width: number } | undefined {
  if (!stroke || stroke.pattern?.type === EMPTY_STROKE_PATTERN) return undefined;
  return {
    color: hasRgb(stroke.color) ? colorToHex(stroke.color) : DEFAULT_STROKE,
    width: stroke.width ?? DEFAULT_STROKE_WIDTH,
  };
}

function fillColor(color: Color | undefined): string | undefined {
  return hasRgb(color) ? colorToHex(color) : undefined;
}

function hasRgb(color: Color | undefined): color is Color {
  return !!color && (color.r !== undefined || color.g !== undefined || color.b !== undefined);
}

/** Marks arrowheads when the style exposes a head (start) or tail (end) line-end. */
function arrowFlags(style: ShapeStyleArchive | undefined): Pick<SvgPath, "markerStart" | "markerEnd"> {
  const properties = style?.shapeProperties;
  return {
    ...(properties?.headLineEnd ? { markerStart: true } : {}),
    ...(properties?.tailLineEnd ? { markerEnd: true } : {}),
  };
}

/** Rounds to 2 decimals, dropping a trailing `.0` (so whole numbers stay clean). */
function round(value: number): number {
  return Number(value.toFixed(2));
}
