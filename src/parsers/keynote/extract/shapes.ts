import type { ImageFill, SvgPath } from "../model.ts";
import type {
  BezierPathSourceArchive,
  Color,
  FillArchive,
  LineEndArchive,
  PathElement,
  ShadowArchive,
  ShapeInfoArchive,
  ShapeStyleArchive,
  ShapeStylePropertiesArchive,
  StrokeArchive,
  StrokePatternArchive,
} from "../types.ts";
import { dataFileNameById } from "./images.ts";
import { colorToHex, hasRgb, rgba, roundAlpha } from "./style.ts";
import { firstInSuperChain, type SuperChainNode } from "./super-chain.ts";

/**
 * The data-id → file-name maps an image fill needs to resolve its backing image,
 * bundled so they thread cleanly down the collect/render chain. Mirrors the
 * resolution `slide.ts`/`images.ts` use: the number-keyed display map first, the
 * bigint-keyed metadata map as fallback.
 */
export interface DataNameMaps {
  fileNames: Map<number, string>;
  info: Map<bigint, string>;
}

/** Empty data maps for callers that resolve no image fills (e.g. placeholder-text scans, tests). */
export const NO_DATA_NAMES: DataNameMaps = { fileNames: new Map(), info: new Map() };

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

/** `TSD.StrokePatternArchive.StrokePatternType.TSDSolidPattern` — a continuous line. */
const SOLID_STROKE_PATTERN = 1;

/** `TSD.StrokePatternArchive.StrokePatternType.TSDEmptyPattern` — an explicit "no line". */
const EMPTY_STROKE_PATTERN = 2;

/** `TSD.StrokeArchive.LineCap.RoundCap` — a rounded line cap (renders tiny dashes as dots). */
const ROUND_CAP = 1;

/** A line-end `identifier` meaning "no arrowhead". */
const NO_LINE_END = "none";

/** Stroke used when a shape has a path but no resolvable style, so lines still show. */
const DEFAULT_STROKE = "currentColor";
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Turns a no-text shape into a LOCAL-coordinate SVG path plus a per-instance
 * `transform` placing it on the slide. Any shape with a drawable path renders
 * (falling back to a plain outline when its style is missing); returns undefined
 * only when it has no path. Local coordinates let identical shapes share one
 * `<defs>` entry, differing only by `transform`.
 */
export function svgPath(
  shape: ShapeInfoArchive,
  style: ShapeStyleArchive | undefined,
  dataNames: DataNameMaps = NO_DATA_NAMES,
): SvgPath | undefined {
  const bezier = bezierSource(shape);
  const elements = bezier?.path?.elements;
  if (!bezier || !elements?.length) {
    return undefined;
  }

  const frame = shapeFrame(shape);
  // A marker inherits its element's transform, so a non-uniform scale would stretch
  // the arrowhead. For arrowed shapes we bake the scale into the path and leave the
  // transform scale-free; others keep the scale on the transform so identical shapes
  // still dedupe to one <defs> path.
  const markers = arrowFlags(style);
  const { localD, transform } = buildLocalPath(elements, frame, markers.markerStart === true || markers.markerEnd === true);
  if (!localD) {
    return undefined;
  }

  const resolved = resolveStyle(style, dataNames);
  const hasMarker = markers.markerStart === true || markers.markerEnd === true;
  const invisible = resolved.stroke === "none" && resolved.fill === "none" && resolved.imageFill === undefined;
  // A shape that paints nothing is invisible in Keynote — drop it so it isn't a
  // phantom outline. An arrowhead-bearing one is kept and given a default line so
  // the arrow still shows.
  if (invisible && !hasMarker) {
    return undefined;
  }
  const paint = invisible ? { ...resolved, stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH } : resolved;

  const opacity = shapeOpacity(style);
  return {
    localD,
    ...(transform ? { transform } : {}),
    ...paint,
    ...markers,
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

/** A shape's geometry split into a reusable local path and its placing transform. */
export interface LocalPath {
  /** SVG `d` in the path's own coordinate space, normalized so its (endpoint) bounding box starts at (0,0). */
  localD: string;
  /** SVG `transform` mapping the local path onto the slide; empty when the mapping is the identity. */
  transform: string;
}

/**
 * Splits a shape's path into a normalized LOCAL `d` (points translated so the
 * endpoint bounding box starts at (0,0)) and a `transform` mapping local → slide
 * as `translate(frameX frameY) rotate(angle cx cy) scale(sx sy)`, with `cx,cy` the
 * frame centre and `sx,sy = frameW/boundsW, frameH/boundsH`. SVG applies the list
 * right-to-left (scale, then rotate, then translate). Identity components are
 * dropped.
 */
export function buildLocalPath(elements: PathElement[], frame: Frame, bakeScale = false): LocalPath {
  const bounds = pathBounds(elements);
  const sx = bounds.width ? frame.width / bounds.width : 1;
  const sy = bounds.height ? frame.height / bounds.height : 1;
  // When baking, the scale folds into the path coordinates and the transform keeps
  // only translate + rotate; otherwise the scale rides the transform so the local
  // path can be shared across differently-sized instances.
  const localD = buildLocalD(elements, bounds, bakeScale ? sx : 1, bakeScale ? sy : 1);
  const transform = buildTransform(frame, bakeScale ? 1 : sx, bakeScale ? 1 : sy);
  return { localD, transform };
}

/**
 * The local `d` string, each point translated to the bounding-box origin. A
 * cubic-bezier element (type 4) emits an SVG `C` from its `[c1, c2, end]` points,
 * falling back to a straight segment when malformed. (Control points may go
 * slightly negative — bounds are measured over endpoints only.)
 */
function buildLocalD(elements: PathElement[], bounds: Bounds, sx: number, sy: number): string {
  const commands: string[] = [];
  const at = (point: { x: number; y: number }): string => localPoint(point, bounds, sx, sy);

  for (const element of elements) {
    if (element.type === ELEMENT_CLOSE) {
      commands.push("Z");
      continue;
    }
    if (element.type === ELEMENT_CURVE_TO && element.points.length >= 3) {
      const [c1, c2, end] = element.points;
      commands.push(`C ${at(c1)} ${at(c2)} ${at(end)}`);
      continue;
    }
    const point = element.points.at(-1);
    if (!point) {
      continue;
    }
    commands.push(`${element.type === ELEMENT_MOVE_TO ? "M" : "L"} ${at(point)}`);
  }

  return commands.join(" ");
}

/** One point translated to the bounding-box origin and optionally scaled, rounded. */
function localPoint(point: { x: number; y: number }, bounds: Bounds, sx: number, sy: number): string {
  return `${round((point.x - bounds.minX) * sx)} ${round((point.y - bounds.minY) * sy)}`;
}

/**
 * The `transform` mapping a local path onto the slide: scale to frame size, rotate
 * around the frame centre, translate to the frame origin. A degenerate axis (zero
 * path width/height, e.g. a flat straight line) scales by 1, NOT 0 — `scale(x, 0)`
 * is a singular matrix that makes SVG renderers drop the element (it doesn't move
 * anything anyway, since every coordinate on that axis is already 0). Identity
 * parts are omitted.
 */
function buildTransform(frame: Frame, sx: number, sy: number): string {
  const parts: string[] = [];
  if (frame.x !== 0 || frame.y !== 0) {
    parts.push(`translate(${round(frame.x)} ${round(frame.y)})`);
  }
  if (frame.angle !== 0) {
    // Keynote angles are counter-clockwise (y-up); SVG `rotate()` is clockwise
    // (y-down), so negate to keep the rotation direction — otherwise rotated shapes
    // (e.g. the diagonal connector arrows) come out vertically mirrored.
    const cssAngle = (360 - frame.angle) % 360;
    parts.push(`rotate(${round(cssAngle)} ${round(frame.width / 2)} ${round(frame.height / 2)})`);
  }
  if (sx !== 1 || sy !== 1) {
    parts.push(`scale(${roundScale(sx)} ${roundScale(sy)})`);
  }
  return parts.join(" ");
}

/** Bounding box of a path's actual drawn extent (curve bulge included). */
interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** A 1-D cubic Bézier evaluated at `t`. */
function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** The interior `t` values (in 0..1) where a 1-D cubic Bézier turns — its local extrema. */
function cubicExtremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative is the quadratic at² + bt + c.
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);
  const ts: number[] = [];
  const inRange = (t: number): void => {
    if (t > 0 && t < 1) {
      ts.push(t);
    }
  };

  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) {
      inRange(-c / b);
    }
    return ts;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return ts;
  }
  const root = Math.sqrt(disc);
  inRange((-b + root) / (2 * a));
  inRange((-b - root) / (2 * a));
  return ts;
}

/**
 * The path's true bounding box. A cubic segment's curve bulges past its endpoints
 * (a circle's beziers reach well beyond their on-axis endpoints), so we include
 * each segment's extrema — measuring endpoints only under-sizes the box and makes
 * the placing scale (frame/bounds) too large.
 */
function pathBounds(elements: PathElement[]): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  let current: { x: number; y: number } | undefined;

  for (const element of elements) {
    if (element.type === ELEMENT_CURVE_TO && element.points.length >= 3 && current) {
      const from = current;
      const [c1, c2, end] = element.points;
      xs.push(end.x, ...cubicExtremaT(from.x, c1.x, c2.x, end.x).map((t) => cubicAt(from.x, c1.x, c2.x, end.x, t)));
      ys.push(end.y, ...cubicExtremaT(from.y, c1.y, c2.y, end.y).map((t) => cubicAt(from.y, c1.y, c2.y, end.y, t)));
      current = end;
      continue;
    }
    const point = element.points.at(-1);
    if (!point) {
      continue;
    }
    xs.push(point.x);
    ys.push(point.y);
    current = point;
  }

  if (xs.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
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
 * The CSS `border-radius` (px) for a rounded-rectangle text-box shape, or
 * undefined otherwise. Keynote stores the corner radius as a `scalarPathSource.
 * scalar` in slide points; we emit a px length, NOT a `%` — a percentage radius is
 * resolved per-axis (X% of width, Y% of height), so wide/tall boxes get stretched,
 * elliptical corners.
 */
export function shapeBorderRadius(shape: ShapeInfoArchive): string | undefined {
  const scalar = shape.super?.pathsource?.scalarPathSource?.scalar;
  if (!scalar) {
    return undefined;
  }
  return `${Math.round(scalar)}px`;
}

/**
 * A node in a shape style's inheritance chain. The resolved stroke/fill/line-ends
 * usually sit one level down the `super` chain (typed as a bare `TSS.StyleArchive`
 * but shape-style-shaped at runtime), so we model it structurally to walk it
 * without casts.
 */
type ShapeStyleNode = SuperChainNode<{ shapeProperties?: ShapeStylePropertiesArchive }>;

/** Reinterprets a resolved shape style as the structural `super`-chain node it is at runtime. */
function shapeStyleNode(style: ShapeStyleArchive | undefined): ShapeStyleNode | undefined {
  return style as unknown as ShapeStyleNode | undefined;
}

/**
 * The first `shapeProperties` along the `super` chain carrying a visible property
 * (stroke, fill, or line-end); empty links are skipped.
 */
export function effectiveShapeProps(style: ShapeStyleArchive | undefined): ShapeStylePropertiesArchive | undefined {
  return firstInSuperChain(shapeStyleNode(style), (node) =>
    hasShapeProps(node.shapeProperties) ? node.shapeProperties : undefined,
  );
}

function hasShapeProps(props: ShapeStylePropertiesArchive | undefined): props is ShapeStylePropertiesArchive {
  return !!props && (!!props.stroke || !!props.fill || !!props.headLineEnd || !!props.tailLineEnd);
}

/**
 * The shape's group-level Style-tab opacity (`shapeProperties.opacity`), rounded to
 * 3 decimals, or undefined when unset or fully opaque. Distinct from the per-channel
 * fill/stroke alphas.
 */
export function shapeOpacity(style: ShapeStyleArchive | undefined): number | undefined {
  const opacity = effectiveShapeProps(style)?.opacity;
  if (opacity === undefined || opacity >= 1) {
    return undefined;
  }
  return roundAlpha(opacity);
}

/**
 * The first non-empty drop `shadow` along the style chain, or undefined. Empty
 * `{}` shadows are skipped so a real shadow deeper in the chain still wins.
 */
function effectiveShadow(style: ShapeStyleArchive | undefined): ShadowArchive | undefined {
  return firstInSuperChain(shapeStyleNode(style), (node) => {
    const shadow = node.shapeProperties?.shadow;
    return shadow && Object.keys(shadow).length > 0 ? shadow : undefined;
  });
}

/**
 * The shape's drop shadow as a CSS `text-shadow`/`box-shadow` value
 * (`"<dx>px <dy>px <blur>px <color>"`), or undefined when there is no real shadow.
 * The offset comes from the polar `angle`/`offset` pair: `dx = offset·cos(angle)`,
 * `dy = -offset·sin(angle)` (the `-` maps Keynote's y-up angle onto CSS's y-down
 * axis, so the stock 315° drop shadow lands bottom-right). `radius` is the blur.
 */
export function shapeTextShadow(style: ShapeStyleArchive | undefined): string | undefined {
  const shadow = effectiveShadow(style);
  if (!shadow || shadow.isEnabled === false) {
    return undefined;
  }

  const offset = shadow.offset ?? 0;
  const blur = shadow.radius ?? 0;
  if (offset === 0 && blur === 0 && !hasRgb(shadow.color)) {
    return undefined;
  }

  const angle = ((shadow.angle ?? 0) * Math.PI) / 180;
  const dx = round(offset * Math.cos(angle));
  const dy = round(-offset * Math.sin(angle));
  return `${dx}px ${dy}px ${round(blur)}px ${shadowColor(shadow)}`;
}

/** A shadow's CSS color: hex when fully opaque, `rgba()` when its combined alpha < 1 (default opaque black). */
function shadowColor(shadow: ShadowArchive): string {
  const hex = hasRgb(shadow.color) ? colorToHex(shadow.color) : "#000000";
  const a = roundAlpha((shadow.color?.a ?? 1) * (shadow.opacity ?? 1));
  return a >= 1 ? hex : rgba(hex, a);
}

/** Stroke resolved to render-ready values, plus optional dash/cap/opacity. */
interface ResolvedStroke {
  color: string;
  width: number;
  dasharray?: string;
  linecap?: string;
  opacity?: number;
}

/** Fill resolved to a color (solid, or an image fill's tint approximation) and optional opacity. */
export interface ResolvedFill {
  color: string;
  opacity?: number;
}

/**
 * Resolves stroke/fill from the shape style's effective properties. Always returns
 * a drawable result: with no visible stroke or fill it falls back to a plain
 * currentColor outline (width 2, fill none) so a shape with a path stays visible.
 *
 * NOTE: real stroke/fill colors are unrecoverable when the style archive was lost
 * to a dropped .iwa chunk — the fallback is an outline a human can recolor.
 */
function resolveStyle(
  style: ShapeStyleArchive | undefined,
  dataNames: DataNameMaps,
): Pick<SvgPath, "stroke" | "strokeWidth" | "fill" | "imageFill" | "strokeDasharray" | "strokeLinecap" | "fillOpacity" | "strokeOpacity"> {
  const props = effectiveShapeProps(style);
  const stroke = resolveStroke(props?.stroke);
  // An image fill paints the shape with its image (+ tint); a solid/other fill stays
  // a flat color. They are mutually exclusive — image fills skip `resolveFill`.
  const imageFill = resolveImageFill(props?.fill, dataNames);
  const fill = imageFill ? undefined : resolveFill(props?.fill);
  if (!stroke && !fill && !imageFill) {
    // No resolvable paint anywhere — the shape is invisible. `svgPath` drops it
    // unless it carries an arrowhead, in which case it gets a default line so the
    // arrow still shows.
    return { stroke: "none", fill: "none" };
  }

  // `stroke-width` is only meaningful with a stroke, so omit it for a fill-only shape.
  const strokeColor = stroke?.color ?? (fill || imageFill ? "none" : DEFAULT_STROKE);
  return {
    stroke: strokeColor,
    ...(strokeColor === "none" ? {} : { strokeWidth: stroke?.width ?? DEFAULT_STROKE_WIDTH }),
    ...(imageFill ? { imageFill } : fill ? { fill: fill.color } : {}),
    ...(stroke?.dasharray ? { strokeDasharray: stroke.dasharray } : {}),
    ...(stroke?.linecap ? { strokeLinecap: stroke.linecap } : {}),
    ...(stroke?.opacity !== undefined ? { strokeOpacity: stroke.opacity } : {}),
    ...(fill?.opacity !== undefined ? { fillOpacity: fill.opacity } : {}),
  };
}

/**
 * Resolves an image fill (`fill.image` with a backing `imagedata.identifier`) to a
 * render-ready `{ fileName, tintColor?, tintOpacity? }`: the file name from the data
 * maps, and the `tint` Color as `#rrggbb` + rounded alpha. The tint is omitted
 * entirely when its alpha rounds to 0 (a fully transparent overlay). Undefined when
 * the fill is not an image fill or its image cannot be resolved to a file (the
 * caller then falls back to a solid/flat fill).
 */
export function resolveImageFill(fill: FillArchive | undefined, dataNames: DataNameMaps): ImageFill | undefined {
  const id = fill?.image?.imagedata?.identifier;
  if (id === undefined) {
    return undefined;
  }
  const fileName = dataFileNameById(id, dataNames.fileNames, dataNames.info);
  if (!fileName) {
    return undefined;
  }
  const resolved: ImageFill = { fileName };
  const tint = fill?.image?.tint;
  if (hasRgb(tint)) {
    const tintAlpha = roundAlpha(alpha(tint));
    if (tintAlpha > 0) {
      resolved.tintColor = colorToHex(tint);
      resolved.tintOpacity = tintAlpha;
    }
  }
  return resolved;
}

/**
 * The backing shape's stroke as a CSS `border` shorthand (e.g. `"2px solid #223274"`),
 * or undefined when it has none — OR when the stroke is a SMART (artistic brush)
 * stroke, which `shapeBrushBorder` renders instead (a box never gets both).
 */
export function shapeBorder(style: ShapeStyleArchive | undefined): string | undefined {
  const archiveStroke = effectiveShapeProps(style)?.stroke;
  if (isSmartStroke(archiveStroke)) {
    return undefined;
  }
  const stroke = resolveStroke(archiveStroke);
  if (!stroke) {
    return undefined;
  }
  const lineStyle = stroke.dasharray ? "dashed" : "solid";
  return `${trimNumber(stroke.width)}px ${lineStyle} ${stroke.color}`;
}

/**
 * The backing shape's SMART stroke (an iWork artistic "brush", e.g. the named
 * `"Pen"` stroke) resolved to a brush border `{ color, width }`, or undefined when
 * the stroke is plain or absent. A smart stroke is a textured hand-drawn line, so
 * the renderer draws it as a rough-filtered SVG outline rather than a flat border.
 */
export function shapeBrushBorder(style: ShapeStyleArchive | undefined): { color: string; width: number } | undefined {
  const archiveStroke = effectiveShapeProps(style)?.stroke;
  if (!isSmartStroke(archiveStroke)) {
    return undefined;
  }
  const stroke = resolveStroke(archiveStroke);
  return stroke ? { color: stroke.color, width: stroke.width } : undefined;
}

/** True when a stroke is a smart (artistic brush) stroke, i.e. it carries a named `smartStroke`. */
function isSmartStroke(stroke: StrokeArchive | undefined): boolean {
  return stroke?.smartStroke?.strokeName !== undefined;
}

function resolveStroke(stroke: StrokeArchive | undefined): ResolvedStroke | undefined {
  if (!stroke || stroke.pattern?.type === EMPTY_STROKE_PATTERN) {
    return undefined;
  }
  const width = stroke.width ?? DEFAULT_STROKE_WIDTH;
  const resolved: ResolvedStroke = {
    color: hasRgb(stroke.color) ? colorToHex(stroke.color) : DEFAULT_STROKE,
    width,
  };
  const dasharray = strokeDasharray(stroke.pattern, width);
  if (dasharray) {
    resolved.dasharray = dasharray;
  }
  if (stroke.cap === ROUND_CAP) {
    resolved.linecap = "round";
  }
  const a = alpha(stroke.color);
  if (a < 1) {
    resolved.opacity = roundAlpha(a);
  }
  return resolved;
}

/**
 * The SVG `stroke-dasharray` for a Keynote stroke pattern, or undefined when the
 * stroke is effectively solid. A dashed stroke's `pattern` holds on/off lengths in
 * stroke-width multiples; we take the first `count`, scale each by the width, and
 * join with commas (e.g. `[0.001,2]` at width 5 → `"0.005,10"`).
 */
export function strokeDasharray(pattern: StrokePatternArchive | undefined, width: number): string | undefined {
  if (!pattern || pattern.type === SOLID_STROKE_PATTERN) {
    return undefined;
  }
  const count = pattern.count ?? 0;
  if (count < 1) {
    return undefined;
  }
  const values = pattern.pattern.slice(0, count);
  if (values.length === 0 || values.every((value) => value === 0)) {
    return undefined;
  }
  return values.map((value) => trimNumber(value * width)).join(",");
}

/** Resolves a fill to a render color: a solid `fill.color`, else an image fill's `tint` (an approximation). */
export function resolveFill(fill: FillArchive | undefined): ResolvedFill | undefined {
  const color = fill?.color ?? fill?.image?.tint;
  if (!hasRgb(color)) {
    return undefined;
  }
  const resolved: ResolvedFill = { color: colorToHex(color) };
  const a = alpha(color);
  if (a < 1) {
    resolved.opacity = roundAlpha(a);
  }
  return resolved;
}

/** A color's alpha channel (0–1), defaulting to fully opaque when unset. */
function alpha(color: Color | undefined): number {
  return color?.a ?? 1;
}

/** Marks arrowheads when the style exposes a head (start) or tail (end) line-end other than "none". */
function arrowFlags(style: ShapeStyleArchive | undefined): Pick<SvgPath, "markerStart" | "markerEnd"> {
  const props = effectiveShapeProps(style);
  // The line runs tail → head, so `headLineEnd` (the arrowhead) belongs at the path
  // END (`markerEnd`) and `tailLineEnd` at the START. Otherwise arrows point the
  // wrong way.
  return {
    ...(hasLineEnd(props?.tailLineEnd) ? { markerStart: true } : {}),
    ...(hasLineEnd(props?.headLineEnd) ? { markerEnd: true } : {}),
  };
}

/** True when a line-end is present and not the explicit "none" identifier. */
function hasLineEnd(end: LineEndArchive | undefined): boolean {
  return !!end && end.identifier !== NO_LINE_END;
}

/** Rounds to 2 decimals, dropping a trailing `.0` (so whole numbers stay clean). */
function round(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Rounds a scale factor to 4 decimals. The factor multiplies local coordinates
 * (up to the path's bounds, often hundreds of units), so it keeps more precision
 * than `round` to hold sub-pixel placement once scaled up.
 */
function roundScale(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Formats a number for a dasharray entry: rounded to 4 decimals to absorb float
 * noise, then stringified so trailing zeros drop (e.g. `0.005`, `10`). Keeps the
 * sub-pixel dash lengths Keynote uses for dotted lines, which `round` would lose.
 */
function trimNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
