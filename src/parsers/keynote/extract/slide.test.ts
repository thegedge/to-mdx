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

test("extractSlide emits a fenced code block for a code-like text box", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(60n)], drawablesZOrder: [] }),
    mockObject(60n, T.shapeInfoArchive, { ownedStorage: ref(61n) }),
    mockObject(61n, T.storageArchive, { text: ["kprobe:vfs_read {\n  @bytes = sum(arg2);\n}"] }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].textBoxes, [
    { kind: "code", language: "", text: "kprobe:vfs_read {\n@bytes = sum(arg2);\n}" },
  ]);
});

test("extractSlide resolves movies to a video data file", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.movieArchive, { super: { parent: ref(10n) }, movieData: ref(700n) }),
    mockObject(80n, T.packageMetadata, { datas: [{ identifier: 700n, fileName: "demo.mov" }] }),
  ]);

  assert.deepEqual(buildPresentation(registry, "x").slides[0].videos, ["demo.mov"]);
});

test("extractSlide resolves an image via the Data/ filename map keyed by data id", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.imageArchive, { super: { accessibilityDescription: "card", parent: ref(10n) }, data: ref(479n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/unite-cardreader-small-479.jpg", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].images, [
    { fileName: "unite-cardreader-small-479.jpg", altText: "card" },
  ]);
});

test("extractSlide resolves a movie via the Data/ filename map keyed by movie data id", () => {
  const registry = buildRegistry([
    ...show(10n),
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.movieArchive, { super: { parent: ref(10n) }, movieData: ref(5855n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/black_friday-5855.mp4", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].videos, ["black_friday-5855.mp4"]);
});
