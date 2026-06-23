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
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "a pic", parent: ref(4n) }, data: ref(100n) }),
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

test("buildPresentation resolves images through the Data/ filenames when given dataFiles", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n)], drawablesZOrder: [] }),
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "a pic", parent: ref(4n) }, data: ref(4235n) }),
    // No PackageMetadata at all: the Data/ filename map must carry resolution.
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/flamegraph-4235.png", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].images, [
    { fileName: "flamegraph-4235.png", altText: "a pic" },
  ]);
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
  assert.deepEqual(slide.textBoxes, [{ kind: "text", paragraphs: [{ depth: 0, text: "Boxed text" }] }]);
});

test("buildPresentation places an image nested in a group under its content slide", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(40n)], drawablesZOrder: [] }),
    mockObject(40n, T.groupArchive, { super: { parent: ref(4n) }, children: [ref(9n)] }),
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "nested", parent: ref(40n) }, data: ref(100n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/pic-100.png", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].images, [
    { fileName: "pic-100.png", altText: "nested" },
  ]);
});

test("buildPresentation places duplicate image objects on their respective content slides", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n), ref(14n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n)], drawablesZOrder: [] }),
    mockObject(14n, T.slideArchive, { ownedDrawables: [ref(19n)], drawablesZOrder: [] }),
    // Two distinct ImageArchive objects backing the same Data/ file, one per slide.
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "a", parent: ref(4n) }, data: ref(100n) }),
    mockObject(19n, T.imageArchive, { super: { accessibilityDescription: "b", parent: ref(14n) }, data: ref(100n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/pic-100.png", new Uint8Array()]]);

  const slides = buildPresentation(registry, "x", dataFiles).slides;
  assert.deepEqual(slides[0].images, [{ fileName: "pic-100.png", altText: "a" }]);
  assert.deepEqual(slides[1].images, [{ fileName: "pic-100.png", altText: "b" }]);
});

test("buildPresentation counts an image reachable both top-down and bottom-up only once", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    // Image is a direct drawable of the slide (top-down reachable) and its parent
    // points back to the slide (bottom-up reachable): must not double-count.
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n)], drawablesZOrder: [] }),
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "once", parent: ref(4n) }, data: ref(100n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/pic-100.png", new Uint8Array()]]);

  assert.deepEqual(buildPresentation(registry, "x", dataFiles).slides[0].images, [
    { fileName: "pic-100.png", altText: "once" },
  ]);
});

test("buildPresentation collects resolvable but unlinkable images into unplacedImages, deduped", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n)], drawablesZOrder: [] }),
    // Placed: parent chain reaches the content slide.
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "ok", parent: ref(4n) }, data: ref(100n) }),
    // Severed owner chain (no parent): resolves to a file but cannot be placed.
    mockObject(19n, T.imageArchive, { super: { accessibilityDescription: "lost" }, data: ref(200n) }),
    // Duplicate occurrence of the same lost file: must collapse to one filename.
    mockObject(29n, T.imageArchive, { super: { accessibilityDescription: "lost too" }, data: ref(200n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/placed-100.png", new Uint8Array()],
    ["Data/lost-200.png", new Uint8Array()],
  ]);

  const presentation = buildPresentation(registry, "x", dataFiles);

  assert.deepEqual(presentation.slides[0].images, [{ fileName: "placed-100.png", altText: "ok" }]);
  assert.deepEqual(presentation.unplacedImages, ["lost-200.png"]);
  assert.ok(!presentation.unplacedImages.includes("placed-100.png"));
});

test("buildPresentation promotes a full-bleed image to the slide background and keeps small ones inline", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] }, size: { width: 1920, height: 1080 } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n), ref(10n)], drawablesZOrder: [] }),
    // Full-bleed: covers the entire slide → becomes the background.
    mockObject(9n, T.imageArchive, {
      super: {
        accessibilityDescription: "bg",
        parent: ref(4n),
        geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
      },
      data: ref(100n),
    }),
    // Small diagram: stays inline, positioned via its box.
    mockObject(10n, T.imageArchive, {
      super: {
        accessibilityDescription: "diagram",
        parent: ref(4n),
        geometry: { position: { x: 192, y: 108 }, size: { width: 384, height: 216 } },
      },
      data: ref(200n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/bg-100.png", new Uint8Array()],
    ["Data/diagram-200.png", new Uint8Array()],
  ]);

  const presentation = buildPresentation(registry, "x", dataFiles);
  const slide = presentation.slides[0];

  assert.equal(slide.background, "bg-100.png");
  assert.deepEqual(slide.images, [
    { fileName: "diagram-200.png", altText: "diagram", box: { left: 10, top: 10, width: 20, height: 20 } },
  ]);
  // The promoted background must not leak into the unplaced-images appendix.
  assert.ok(!presentation.unplacedImages.includes("bg-100.png"));
});

test("buildPresentation derives crop geometry for a masked image and leaves a maskless one uncropped", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] }, size: { width: 1000, height: 1000 } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n), ref(10n)], drawablesZOrder: [] }),
    // Masked image: frame (x=100,y=100,w=400,h=400); mask frame (mx=50,my=100,mw=200,mh=100)
    // in the image's local space. Visible region = (150,200,200,100).
    mockObject(9n, T.imageArchive, {
      super: {
        accessibilityDescription: "masked",
        parent: ref(4n),
        geometry: { position: { x: 100, y: 100 }, size: { width: 400, height: 400 } },
      },
      data: ref(100n),
      mask: ref(900n),
    }),
    mockObject(900n, T.maskArchive, {
      super: { parent: ref(9n), geometry: { position: { x: 50, y: 100 }, size: { width: 200, height: 100 } } },
    }),
    // Maskless image on the same slide: stays uncropped.
    mockObject(10n, T.imageArchive, {
      super: {
        accessibilityDescription: "plain",
        parent: ref(4n),
        geometry: { position: { x: 0, y: 0 }, size: { width: 200, height: 200 } },
      },
      data: ref(200n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/masked-100.png", new Uint8Array()],
    ["Data/plain-200.png", new Uint8Array()],
  ]);

  const images = buildPresentation(registry, "x", dataFiles).slides[0].images;
  const masked = images.find((image) => image.fileName === "masked-100.png");
  const plain = images.find((image) => image.fileName === "plain-200.png");

  assert.deepEqual(masked?.crop, {
    left: 15,
    top: 20,
    width: 20,
    height: 10,
    imgLeft: -25,
    imgTop: -100,
    imgWidth: 200,
    imgHeight: 400,
  });
  assert.equal(plain?.crop, undefined);
});

test("buildPresentation inherits a master's positioned logo onto the content slide and out of unplacedImages", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] }, size: { width: 1920, height: 1080 } }),
    // Content slide referencing the master via templateSlide; it owns nothing.
    mockObject(4n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    // Master with a small logo image plus a title shape that must be ignored.
    mockObject(60n, T.slideArchive, { ownedDrawables: [], drawablesZOrder: [ref(61n), ref(63n)] }),
    mockObject(61n, T.imageArchive, {
      super: {
        accessibilityDescription: "logo",
        parent: ref(60n),
        geometry: { position: { x: 192, y: 108 }, size: { width: 192, height: 108 } },
      },
      data: ref(100n),
    }),
    mockObject(63n, T.shapeInfoArchive, { ownedStorage: ref(64n) }),
    mockObject(64n, T.storageArchive, { text: ["Title placeholder"] }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/logo-100.png", new Uint8Array()]]);

  const presentation = buildPresentation(registry, "x", dataFiles);
  const slide = presentation.slides[0];

  assert.deepEqual(slide.images, [
    { fileName: "logo-100.png", altText: "logo", box: { left: 10, top: 10, width: 10, height: 10 } },
  ]);
  assert.equal(slide.background, undefined);
  assert.ok(!presentation.unplacedImages.includes("logo-100.png"));
});

test("buildPresentation skips a master's sage-tagged image placeholder (e.g. a Media slot), inheriting only untagged decorations", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] }, size: { width: 1920, height: 1080 } }),
    mockObject(4n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    // Master with a tagged "Media" photo placeholder (62) and an untagged logo (61).
    mockObject(60n, T.slideArchive, {
      ownedDrawables: [],
      drawablesZOrder: [ref(61n), ref(62n)],
      sageTagToInfoMap: [{ tag: "Media", info: ref(62n) }],
    }),
    mockObject(61n, T.imageArchive, {
      super: {
        accessibilityDescription: "logo",
        parent: ref(60n),
        geometry: { position: { x: 192, y: 108 }, size: { width: 192, height: 108 } },
      },
      data: ref(100n),
    }),
    mockObject(62n, T.imageArchive, {
      super: {
        accessibilityDescription: "sample photo",
        parent: ref(60n),
        geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
      },
      data: ref(200n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/logo-100.png", new Uint8Array()],
    ["Data/sample-200.png", new Uint8Array()],
  ]);

  const presentation = buildPresentation(registry, "x", dataFiles);
  const slide = presentation.slides[0];

  // The untagged logo is inherited; the tagged placeholder photo is not used anywhere.
  assert.deepEqual(
    slide.images.map((image) => image.fileName),
    ["logo-100.png"],
  );
  assert.equal(slide.background, undefined);
  assert.ok(!presentation.unplacedImages.includes("logo-100.png"));
});

test("buildPresentation uses a master full-bleed image as background only when the slide has none of its own", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n), ref(5n)] }, size: { width: 1920, height: 1080 } }),
    // Slide A: no own background — inherits the master full-bleed image.
    mockObject(4n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    // Slide B: promotes its OWN full-bleed background — keeps it.
    mockObject(5n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.imageArchive, {
      super: {
        accessibilityDescription: "own-bg",
        parent: ref(5n),
        geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
      },
      data: ref(200n),
    }),
    // Master with one full-bleed background image.
    mockObject(60n, T.slideArchive, { ownedDrawables: [], drawablesZOrder: [ref(61n)] }),
    mockObject(61n, T.imageArchive, {
      super: {
        accessibilityDescription: "master-bg",
        parent: ref(60n),
        geometry: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
      },
      data: ref(100n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([
    ["Data/masterbg-100.png", new Uint8Array()],
    ["Data/ownbg-200.png", new Uint8Array()],
  ]);

  const presentation = buildPresentation(registry, "x", dataFiles);

  // Slide A inherits the master full-bleed as its background.
  assert.equal(presentation.slides[0].background, "masterbg-100.png");
  assert.deepEqual(presentation.slides[0].images, []);
  // Slide B keeps its own; the master's full-bleed is not used and not added inline.
  assert.equal(presentation.slides[1].background, "ownbg-200.png");
  assert.deepEqual(presentation.slides[1].images, []);
  assert.ok(!presentation.unplacedImages.includes("masterbg-100.png"));
});

test("buildPresentation leaves a slide without a master unchanged", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n)] } }),
    mockObject(4n, T.slideArchive, { ownedDrawables: [ref(9n)], drawablesZOrder: [] }),
    mockObject(9n, T.imageArchive, { super: { accessibilityDescription: "own", parent: ref(4n) }, data: ref(100n) }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/own-100.png", new Uint8Array()]]);

  const slide = buildPresentation(registry, "x", dataFiles).slides[0];
  assert.deepEqual(slide.images, [{ fileName: "own-100.png", altText: "own" }]);
  assert.equal(slide.background, undefined);
});

test("buildPresentation inherits a shared master's image onto every slide that uses it", () => {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(4n), ref(5n)] }, size: { width: 1920, height: 1080 } }),
    mockObject(4n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(5n, T.slideArchive, { templateSlide: ref(60n), ownedDrawables: [], drawablesZOrder: [] }),
    mockObject(60n, T.slideArchive, { ownedDrawables: [], drawablesZOrder: [ref(61n)] }),
    mockObject(61n, T.imageArchive, {
      super: {
        accessibilityDescription: "logo",
        parent: ref(60n),
        geometry: { position: { x: 192, y: 108 }, size: { width: 192, height: 108 } },
      },
      data: ref(100n),
    }),
  ]);
  const dataFiles = new Map<string, Uint8Array>([["Data/logo-100.png", new Uint8Array()]]);

  const slides = buildPresentation(registry, "x", dataFiles).slides;
  const box = { left: 10, top: 10, width: 10, height: 10 };
  assert.deepEqual(slides[0].images, [{ fileName: "logo-100.png", altText: "logo", box }]);
  assert.deepEqual(slides[1].images, [{ fileName: "logo-100.png", altText: "logo", box }]);
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
