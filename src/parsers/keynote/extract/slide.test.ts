import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { KeynoteType, PlaceholderKind } from "../types.ts";
import { buildPresentation } from "./document.ts";

const T = KeynoteType;

function show(slideRef: bigint) {
  return [
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(slideRef)] } }),
  ];
}

function placeholder(id: bigint, storageId: bigint, kind: number, text: string) {
  return [
    mockObject(id, T.placeholderArchive, { kind, super: { ownedStorage: ref(storageId) } }),
    mockObject(storageId, T.storageArchive, { text: [text] }),
  ];
}

/** A no-text two-point line shape with a stroke style, producing one SVG path. */
function lineShape(id: bigint, styleId: bigint) {
  return [
    mockObject(id, T.shapeInfoArchive, {
      super: {
        super: { geometry: { position: { x: 0, y: 0 }, size: { width: 100, height: 0 }, angle: 0 } },
        style: ref(styleId),
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
    }),
    mockObject(styleId, T.shapeStyleArchive, {
      shapeProperties: { stroke: { color: { model: 1, r: 0, g: 0, b: 0 }, width: 2 } },
    }),
  ];
}

test("extractSlide stamps each free shape and text box with its drawablesZOrder rank (shape above/below the box)", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      ownedDrawables: [],
      // back-to-front: line (0) under the box (1) under the icon line (2).
      drawablesZOrder: [ref(60n), ref(40n), ref(70n)],
    }),
    ...lineShape(60n, 61n),
    ...placeholder(40n, 41n, PlaceholderKind.object, "verifier"),
    ...lineShape(70n, 71n),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];

  const box = slide.textBoxes[0];
  assert.equal(box.kind === "text" ? box.zOrder : undefined, 1);
  const shapeOrders = (slide.shapes ?? []).map((shape) => shape.zOrder).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(shapeOrders, [0, 2]);
});

test("extractSlide leaves zOrder unset when a slide declares no drawablesZOrder (ownedDrawables fallback)", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(40n)], drawablesZOrder: [] }),
    ...placeholder(40n, 41n, PlaceholderKind.object, "caption"),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.deepEqual(slide.textBoxes, [{ kind: "text", paragraphs: [{ depth: 0, text: "caption" }] }]);
});

test("extractSlide classifies title/body placeholders by kind and keeps them out of textBoxes", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      ownedDrawables: [ref(20n), ref(30n), ref(40n), ref(50n)],
      drawablesZOrder: [],
    }),
    ...placeholder(20n, 21n, PlaceholderKind.title, "Network Monitor"),
    ...placeholder(30n, 31n, PlaceholderKind.body, "Point one\nPoint two"),
    ...placeholder(40n, 41n, PlaceholderKind.object, "Object placeholder text"),
    mockObject(50n, T.shapeInfoArchive, { ownedStorage: ref(51n) }),
    mockObject(51n, T.storageArchive, { text: ["A loose caption"] }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];

  assert.equal(slide.title, "Network Monitor");
  assert.deepEqual(slide.body, [
    { depth: 0, text: "Point one" },
    { depth: 0, text: "Point two" },
  ]);
  assert.deepEqual(slide.textBoxes, [
    { kind: "text", paragraphs: [{ depth: 0, text: "Object placeholder text" }] },
    { kind: "text", paragraphs: [{ depth: 0, text: "A loose caption" }] },
  ]);
});

test("extractSlide drops a title still holding the master's inherited default text", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      titlePlaceholder: ref(20n),
      ownedDrawables: [ref(20n)],
      drawablesZOrder: [],
      templateSlide: ref(90n),
    }),
    ...placeholder(20n, 21n, PlaceholderKind.title, "Comparison Slide"),
    // Master slide (not in the slide tree) supplies the default title text.
    mockObject(90n, T.slideArchive, { titlePlaceholder: ref(91n), ownedDrawables: [], drawablesZOrder: [] }),
    ...placeholder(91n, 92n, PlaceholderKind.title, "Comparison Slide"),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.equal(slide.title, undefined);
  assert.deepEqual(slide.textBoxes, []);
});

test("extractSlide prefers the authoritative thumbnail title over inherited default text", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      titlePlaceholder: ref(20n),
      ownedDrawables: [ref(20n)],
      drawablesZOrder: [],
      templateSlide: ref(90n),
      thumbnailTextForTitlePlaceholder: "Takeaways",
    }),
    ...placeholder(20n, 21n, PlaceholderKind.title, "Comparison Slide"),
    mockObject(90n, T.slideArchive, { titlePlaceholder: ref(91n), ownedDrawables: [], drawablesZOrder: [] }),
    ...placeholder(91n, 92n, PlaceholderKind.title, "Comparison Slide"),
  ]);

  assert.equal(buildPresentation(registry, "x").slides[0].title, "Takeaways");
});

test("extractSlide uses the Sage Title drawable and keeps it out of textBoxes", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      titlePlaceholder: ref(20n),
      sageTagToInfoMap: [{ tag: "Title", info: ref(30n) }],
      ownedDrawables: [ref(30n)],
      drawablesZOrder: [],
    }),
    // On a modern content slide the title placeholder is empty.
    ...placeholder(20n, 21n, PlaceholderKind.title, ""),
    mockObject(30n, T.shapeInfoArchive, { ownedStorage: ref(31n) }),
    mockObject(31n, T.storageArchive, { text: ["Network Monitor"] }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.equal(slide.title, "Network Monitor");
  assert.deepEqual(slide.textBoxes, []);
});

test("extractSlide drops a Sage Title equal to the master's Sage Title", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      sageTagToInfoMap: [{ tag: "Title", info: ref(30n) }],
      ownedDrawables: [ref(30n)],
      drawablesZOrder: [],
      templateSlide: ref(90n),
    }),
    mockObject(30n, T.shapeInfoArchive, { ownedStorage: ref(31n) }),
    mockObject(31n, T.storageArchive, { text: ["Comparison Slide"] }),
    // Master supplies the same Sage Title text, so the slide inherited it.
    mockObject(90n, T.slideArchive, {
      sageTagToInfoMap: [{ tag: "Title", info: ref(91n) }],
      ownedDrawables: [],
      drawablesZOrder: [],
    }),
    mockObject(91n, T.shapeInfoArchive, { ownedStorage: ref(92n) }),
    mockObject(92n, T.storageArchive, { text: ["Comparison Slide"] }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.equal(slide.title, undefined);
  assert.deepEqual(slide.textBoxes, []);
});

function sageShape(id: bigint, storageId: bigint, text: string) {
  return [
    mockObject(id, T.shapeInfoArchive, { ownedStorage: ref(storageId) }),
    mockObject(storageId, T.storageArchive, { text: [text] }),
  ];
}

test("extractSlide promotes a Subheading title + Bullets body and keeps both out of textBoxes", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      sageTagToInfoMap: [
        { tag: "Subheading", info: ref(30n) },
        { tag: "Bullets", info: ref(40n) },
        { tag: "Stat", info: ref(50n) },
      ],
      ownedDrawables: [ref(30n), ref(40n), ref(50n)],
      drawablesZOrder: [],
    }),
    ...sageShape(30n, 31n, "Takeaways"),
    ...sageShape(40n, 41n, "How TCP works\nWhat eBPF is"),
    ...sageShape(50n, 51n, "99.9%"),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];

  assert.equal(slide.title, "Takeaways");
  assert.deepEqual(slide.body, [
    { depth: 0, text: "How TCP works" },
    { depth: 0, text: "What eBPF is" },
  ]);
  // The Stat-tagged box stays a positioned free text box; title/body do not.
  assert.deepEqual(slide.textBoxes, [{ kind: "text", paragraphs: [{ depth: 0, text: "99.9%" }] }]);
});

test("extractSlide keeps the Title tag as the title when both Title and Subheading exist", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      sageTagToInfoMap: [
        { tag: "Subheading", info: ref(30n) },
        { tag: "Title", info: ref(35n) },
      ],
      ownedDrawables: [ref(30n), ref(35n)],
      drawablesZOrder: [],
    }),
    ...sageShape(30n, 31n, "A subheading"),
    ...sageShape(35n, 36n, "The Real Title"),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.equal(slide.title, "The Real Title");
  // Neither title candidate leaks into the positioned text boxes.
  assert.deepEqual(slide.textBoxes, []);
});

test("extractSlide falls back to the title placeholder when no Sage Title tag exists", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, {
      titlePlaceholder: ref(20n),
      ownedDrawables: [ref(20n)],
      drawablesZOrder: [],
    }),
    ...placeholder(20n, 21n, PlaceholderKind.title, "Plain Title"),
  ]);

  assert.equal(buildPresentation(registry, "x").slides[0].title, "Plain Title");
});

test("extractSlide captures a free text box's geometry and dominant paragraph style", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.shapeInfoArchive, {
      ownedStorage: ref(51n),
      super: { super: { geometry: { position: { x: 192, y: 108 }, size: { width: 960, height: 540 } } } },
    }),
    mockObject(51n, T.storageArchive, {
      text: ["99.9% uptime"],
      tableParaStyle: { entries: [{ characterIndex: 0, object: ref(52n) }] },
    }),
    // Paragraph style (type id irrelevant; the registry resolves by reference).
    mockObject(52n, 9000, {
      charProperties: { fontSize: 36, bold: true, fontColor: { r: 1, g: 0, b: 0 } },
      paraProperties: { alignment: 2 },
    }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].textBoxes[0], {
    kind: "text",
    // The paragraph now carries its own slide-height-relative size token too; with a
    // single paragraph it matches the box-level size, so rendering stays uniform.
    paragraphs: [{ depth: 0, text: "99.9% uptime", fontSizeToken: "var(--text-lg)" }],
    box: { left: 10, top: 10, width: 50, height: 50 },
    style: { fontSizeToken: "var(--text-lg)", color: "#ff0000", fontWeight: 700, textAlign: "center" },
  });
});

test("extractSlide applies the character-style fontColor as an override over the paragraph style", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.shapeInfoArchive, { ownedStorage: ref(51n) }),
    mockObject(51n, T.storageArchive, {
      text: ["Label"],
      tableParaStyle: { entries: [{ characterIndex: 0, object: ref(52n) }] },
      tableCharStyle: { entries: [{ characterIndex: 0, object: ref(53n) }] },
    }),
    mockObject(52n, 9000, { charProperties: { fontColor: { r: 1, g: 0, b: 0 } } }),
    mockObject(53n, 9001, { charProperties: { fontColor: { r: 0, g: 0, b: 1 } } }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].textBoxes[0], {
    kind: "text",
    paragraphs: [{ depth: 0, text: "Label" }],
    style: { color: "#0000ff" },
  });
});

test("extractSlide yields geometry but no style when a free text box has no resolvable style", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.shapeInfoArchive, {
      ownedStorage: ref(51n),
      super: { super: { geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } } } },
    }),
    mockObject(51n, T.storageArchive, { text: ["A loose caption"] }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].textBoxes[0], {
    kind: "text",
    paragraphs: [{ depth: 0, text: "A loose caption" }],
    box: { left: 0, top: 0, width: 100, height: 100 },
  });
});

test("extractSlide emits a fenced code block for a code-like text box", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(60n)], drawablesZOrder: [] }),
    mockObject(60n, T.shapeInfoArchive, { ownedStorage: ref(61n) }),
    mockObject(61n, T.storageArchive, { text: ["kprobe:vfs_read {\n  @bytes = sum(arg2);\n}"] }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].textBoxes, [
    { kind: "code", language: "", text: "kprobe:vfs_read {\n  @bytes = sum(arg2);\n}" },
  ]);
});

test("extractSlide collects a no-text stroked shape as a vector path and not a text box", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.shapeInfoArchive, {
      super: {
        style: ref(55n),
        super: { geometry: { position: { x: 100, y: 200 }, size: { width: 716, height: 0 }, angle: 0 } },
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
    }),
    mockObject(55n, T.shapeArchive, { shapeProperties: { stroke: { color: { r: 0, g: 0, b: 0 }, width: 2 } } }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.deepEqual(slide.textBoxes, []);
  assert.ok(slide.shapes);
  assert.equal(slide.shapes.length, 1);
  assert.equal(slide.shapes[0].stroke, "#000000");
  // Local path at the origin; the frame position/scale rides the transform.
  assert.equal(slide.shapes[0].localD, "M 0 0 L 100 0");
  assert.equal(slide.shapes[0].transform, "translate(100 200) scale(7.16 1)");
});

test("extractSlide drops a no-text frame whose style resolves to nothing visible (invisible, not a phantom outline)", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.shapeInfoArchive, {
      super: {
        style: ref(55n),
        super: { geometry: { position: { x: 0, y: 0 }, size: { width: 100, height: 0 }, angle: 0 } },
        pathsource: {
          bezierPathSource: {
            naturalSize: { width: 100, height: 0 },
            path: { elements: [{ type: 1, points: [{ x: 0, y: 0 }] }, { type: 2, points: [{ x: 100, y: 0 }] }] },
          },
        },
      },
    }),
    mockObject(55n, T.shapeArchive, { shapeProperties: {} }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  // The frame paints nothing and has no arrowhead, so it is not emitted at all.
  assert.equal(slide.shapes, undefined);
});

test("extractSlide resolves movies to a video data file", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.movieArchive, { super: { parent: ref(10n) }, movieData: ref(700n) }),
    mockObject(80n, T.packageMetadata, { datas: [{ identifier: 700n, fileName: "demo.mov" }] }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].videos, [{ fileName: "demo.mov" }]);
});

test("extractSlide resolves an image via the Data/ filename map keyed by data id", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.imageArchive, { super: { accessibilityDescription: "card", parent: ref(10n) }, data: ref(479n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/unite-cardreader-small-479.jpg", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].images, [
    { fileName: "unite-cardreader-small.jpg", altText: "card" },
  ]);
});

test("extractSlide resolves a movie via the Data/ filename map keyed by movie data id", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.movieArchive, { super: { parent: ref(10n) }, movieData: ref(5855n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/black_friday-5855.mp4", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].videos, [{ fileName: "black_friday.mp4" }]);
});

test("extractSlide resolves the slide background color from a nested super slideProperties fill", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { style: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    // The real slideProperties live one level down the inherited super chain.
    mockObject(60n, 700, {
      slideProperties: {},
      super: { slideProperties: { fill: { color: { model: 1, r: 0.13, g: 0.2, b: 0.45, a: 1 } } } },
    }),
  ]);

  assert.equal(buildPresentation(registry, "x").slides[0].backgroundColor, "#213373");
});

test("extractSlide leaves backgroundColor unset when the slide style declares no solid fill", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { style: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(60n, 700, { slideProperties: { fill: { gradient: {} } } }),
  ]);

  assert.equal(buildPresentation(registry, "x").slides[0].backgroundColor, undefined);
});

test("extractSlide resolves an image-fill slide background to a file name and its tint as an rgba overlay", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { style: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(60n, 700, {
      slideProperties: {
        fill: {
          image: { imagedata: { identifier: 4713n }, tint: { model: 1, r: 0.13, g: 0.2, b: 0.45, a: 0.756 } },
        },
      },
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/universe-1050036_1280-4713.jpg", new Uint8Array()]]);

  const slide = buildPresentation(registry, "x", dataFiles).slides[0];
  assert.equal(slide.background, "universe-1050036_1280.jpg");
  assert.equal(slide.backgroundTint, "rgba(33, 51, 115, 0.76)");
  assert.equal(slide.backgroundColor, undefined);
});

test("extractSlide omits backgroundTint when an image-fill slide background carries no tint", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { style: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(60n, 700, { slideProperties: { fill: { image: { imagedata: { identifier: 4713n } } } } }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/universe-1050036_1280-4713.jpg", new Uint8Array()]]);

  const slide = buildPresentation(registry, "x", dataFiles).slides[0];
  assert.equal(slide.background, "universe-1050036_1280.jpg");
  assert.equal(slide.backgroundTint, undefined);
});

test("extractSlide lets a promoted full-bleed drawable image win over the style image-fill background", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { style: ref(60n), ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    // Style declares an image fill (would otherwise set the background)...
    mockObject(60n, 700, { slideProperties: { fill: { image: { imagedata: { identifier: 4713n } } } } }),
    // ...but the slide owns a full-bleed drawable image, which must win.
    mockObject(70n, T.imageArchive, {
      super: {
        accessibilityDescription: "hero",
        parent: ref(10n),
        super: { geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } } },
      },
      data: ref(8001n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/universe-1050036_1280-4713.jpg", new Uint8Array()],
    ["Data/hero-8001.jpg", new Uint8Array()],
  ]);

  const slide = buildPresentation(registry, "x", dataFiles).slides[0];
  assert.equal(slide.background, "hero.jpg");
});

/** A free (untagged) text shape whose shape style carries `fill` in its props. */
function filledTextShape(id: bigint, storageId: bigint, text: string, styleId: bigint, fill: unknown) {
  return [
    mockObject(id, T.shapeInfoArchive, { ownedStorage: ref(storageId), super: { style: ref(styleId) } }),
    mockObject(storageId, T.storageArchive, { text: [text] }),
    mockObject(styleId, 0, { shapeProperties: { fill } }),
  ];
}

function firstTextBoxStyle(registry: ReturnType<typeof buildRegistry>) {
  const box = buildPresentation(registry, "x").slides[0].textBoxes[0];
  return box.kind === "text" ? box.style : undefined;
}

test("extractSlide lifts a free text box's solid shape fill as its backgroundColor", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...filledTextShape(50n, 51n, "verifier", 52n, { color: { model: 1, r: 0.41, g: 0.737, b: 0.745, a: 1 } }),
  ]);

  assert.equal(firstTextBoxStyle(registry)?.backgroundColor, "#69bcbe");
});

test("extractSlide uses an image fill's tint (rgba when translucent) as the backgroundColor", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...filledTextShape(50n, 51n, "user program", 52n, { image: { tint: { model: 1, r: 0, g: 0, b: 1, a: 0.5 } } }),
  ]);

  assert.equal(firstTextBoxStyle(registry)?.backgroundColor, "rgba(0, 0, 255, 0.5)");
});

test("extractSlide leaves a free text box's backgroundColor unset when its shape has no fill color", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...filledTextShape(50n, 51n, "Userland", 52n, {}),
  ]);

  assert.equal(firstTextBoxStyle(registry)?.backgroundColor, undefined);
});

/** A free text shape whose shape style carries arbitrary `shapeProperties`. */
function styledTextShape(id: bigint, storageId: bigint, text: string, styleId: bigint, shapeProperties: unknown) {
  return [
    mockObject(id, T.shapeInfoArchive, { ownedStorage: ref(storageId), super: { style: ref(styleId) } }),
    mockObject(storageId, T.storageArchive, { text: [text] }),
    mockObject(styleId, 0, { shapeProperties }),
  ];
}

test("extractSlide threads a translucent shape opacity into a free text box's style", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...styledTextShape(50n, 51n, "label", 52n, { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, opacity: 0.7 }),
  ]);
  assert.equal(firstTextBoxStyle(registry)?.opacity, 0.7);
});

test("extractSlide converts a free text box's shape drop shadow into a CSS textShadow", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...styledTextShape(50n, 51n, "Thanks!", 52n, {
      shadow: { color: { model: 1, r: 0, g: 0, b: 0, a: 1 }, angle: 90, offset: 2, radius: 16, opacity: 1, isEnabled: true },
    }),
  ]);
  assert.equal(firstTextBoxStyle(registry)?.textShadow, "0px -2px 16px #000000");
});

test("extractSlide emits no textShadow for a free text box whose shape carries an empty shadow", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    ...styledTextShape(50n, 51n, "plain", 52n, { fill: { color: { model: 1, r: 1, g: 1, b: 1, a: 1 } }, shadow: {} }),
  ]);
  assert.equal(firstTextBoxStyle(registry)?.textShadow, undefined);
});
