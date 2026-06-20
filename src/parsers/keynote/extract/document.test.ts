import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { KeynoteType } from "../types.ts";
import { buildPresentation } from "./document.ts";

const T = KeynoteType;

function fullDeck() {
  return buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(3n)] } }),
    mockObject(3n, T.slideNodeArchive, { slide: ref(4n), children: [] }),
    mockObject(4n, T.slideArchive, {
      titlePlaceholder: ref(5n),
      bodyPlaceholder: ref(6n),
      ownedDrawables: [ref(9n)],
      drawablesZOrder: [],
      note: ref(20n),
    }),
    mockObject(5n, T.placeholderArchive, { super: { ownedStorage: ref(7n) } }),
    mockObject(6n, T.placeholderArchive, { super: { ownedStorage: ref(8n) } }),
    mockObject(7n, T.storageArchive, { text: ["My Title"] }),
    mockObject(8n, T.storageArchive, {
      text: ["Bullet one\nBullet two"],
      tableParaData: {
        entries: [
          { characterIndex: 0, first: 0, second: 0 },
          { characterIndex: 11, first: 1, second: 0 },
        ],
      },
    }),
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "a pic" }, data: ref(100n) }),
    mockObject(20n, T.noteArchive, { containedStorage: ref(21n) }),
    mockObject(21n, T.storageArchive, { text: ["Speaker note"] }),
    mockObject(50n, T.packageMetadata, { datas: [{ identifier: 100n, fileName: "image1.png" }] }),
  ]);
}

test("buildPresentation extracts title, body bullets, images and notes from a slide", () => {
  const presentation = buildPresentation(fullDeck(), "fallback");

  assert.equal(presentation.slides.length, 1);
  const slide = presentation.slides[0];

  assert.equal(slide.title, "My Title");
  assert.deepEqual(slide.body, [
    { depth: 0, text: "Bullet one" },
    { depth: 1, text: "Bullet two" },
  ]);
  assert.deepEqual(slide.images, [{ fileName: "image1.png", altText: "a pic" }]);
  assert.deepEqual(slide.notes, [{ depth: 0, text: "Speaker note" }]);
});

test("buildPresentation uses the first slide title, falling back to the given title", () => {
  assert.equal(buildPresentation(fullDeck(), "fallback").title, "My Title");

  const titleless = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [], drawablesZOrder: [] }),
  ]);
  assert.equal(buildPresentation(titleless, "fallback").title, "fallback");
});

test("buildPresentation preserves slide order from the slide tree", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(11n), ref(12n), ref(13n)] } }),
    slideWithTitle(11n, 111n, "Alpha"),
    slideWithTitle(12n, 112n, "Beta"),
    slideWithTitle(13n, 113n, "Gamma"),
  ].flat());

  const titles = buildPresentation(registry, "x").slides.map((s) => s.title);
  assert.deepEqual(titles, ["Alpha", "Beta", "Gamma"]);
});

test("buildPresentation walks rootSlideNode children when no flat slide list exists", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [], rootSlideNode: ref(11n) } }),
    ...nodeWithTitle(11n, 111n, "Alpha", [ref(12n)]),
    ...nodeWithTitle(12n, 112n, "Beta", []),
  ]);

  const titles = buildPresentation(registry, "x").slides.map((s) => s.title);
  assert.deepEqual(titles, ["Alpha", "Beta"]);
});

test("buildPresentation counts tables and groups recurse into children", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(30n), ref(40n)], drawablesZOrder: [] }),
    mockObject(30n, T.tableInfoArchive, {}),
    mockObject(40n, T.groupArchive, { children: [ref(41n)] }),
    mockObject(41n, T.shapeInfoArchive, { ownedStorage: ref(42n) }),
    mockObject(42n, T.storageArchive, { text: ["Boxed text"] }),
  ]);

  const slide = buildPresentation(registry, "x").slides[0];
  assert.equal(slide.tableCount, 1);
  assert.deepEqual(slide.textBoxes, [[{ depth: 0, text: "Boxed text" }]]);
});

function slideWithTitle(slideId: bigint, storageId: bigint, title: string) {
  return [
    mockObject(slideId, T.slideArchive, { titlePlaceholder: ref(storageId + 1000n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(storageId + 1000n, T.placeholderArchive, { super: { ownedStorage: ref(storageId) } }),
    mockObject(storageId, T.storageArchive, { text: [title] }),
  ];
}

function nodeWithTitle(nodeId: bigint, storageId: bigint, title: string, children: Array<{ identifier: bigint }>) {
  const slideId = nodeId + 500n;
  return [
    mockObject(nodeId, T.slideNodeArchive, { slide: ref(slideId), children }),
    ...slideWithTitle(slideId, storageId, title),
  ];
}
