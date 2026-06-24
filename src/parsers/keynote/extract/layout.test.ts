import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { KeynoteType } from "../types.ts";
import { buildPresentation } from "./document.ts";
import { contentBoxPercent, isFullBleed, normalizeLayoutClass, slideLayoutClass } from "./layout.ts";

const T = KeynoteType;

test("slideLayoutClass maps a known master name to the ODP layout vocabulary", () => {
  assert.equal(slideLayoutClass({ masterName: "Title & Bullets" }), "title-with-points");
  assert.equal(slideLayoutClass({ masterName: "Comparison" }), "two-column");
  assert.equal(slideLayoutClass({ masterName: "Title - Center" }), "title");
});

test("slideLayoutClass maps a Thanks!/Thank you title to the thank-you layout", () => {
  assert.equal(slideLayoutClass({ title: "Thanks!" }), "thank-you");
  assert.equal(slideLayoutClass({ title: "Thank you" }), "thank-you");
  assert.equal(slideLayoutClass({ title: "thank you" }), "thank-you");
  assert.equal(slideLayoutClass({ title: "Questions?" }), undefined);
});

test("slideLayoutClass returns undefined for an unknown master and no geometry", () => {
  assert.equal(slideLayoutClass({ masterName: "Some Custom Master" }), undefined);
  assert.equal(slideLayoutClass({}), undefined);
});

test("slideLayoutClass derives centering from the shared kernel via the content box", () => {
  assert.equal(slideLayoutClass({ contentBox: { left: 30, top: 30, width: 40, height: 40 } }), "centered");
});

test("slideLayoutClass collapses a full-bleed slide to blank even under a content master", () => {
  assert.equal(
    slideLayoutClass({ masterName: "Comparison", contentBox: { left: 0, top: 30, width: 100, height: 40 } }),
    "blank",
  );
});

test("normalizeLayoutClass dedupes tokens and collapses any content layout to blank when blank is present", () => {
  assert.equal(normalizeLayoutClass("blank centered blank"), "blank");
  assert.equal(normalizeLayoutClass("two-column centered blank"), "blank");
  assert.equal(normalizeLayoutClass("two-column blank"), "blank");
  assert.equal(normalizeLayoutClass("centered"), "centered");
  assert.equal(normalizeLayoutClass("title"), "title");
});

test("contentBoxPercent boxes drawables as slide-size percentages", () => {
  const box = contentBoxPercent([{ x: 192, y: 108, width: 960, height: 540 }], { width: 1920, height: 1080 });
  assert.deepEqual(box, { left: 10, top: 10, width: 50, height: 50 });
});

test("contentBoxPercent returns null with no geometries or a degenerate slide size", () => {
  assert.equal(contentBoxPercent([], { width: 1920, height: 1080 }), null);
  assert.equal(contentBoxPercent([{ x: 0, y: 0, width: 10, height: 10 }], { width: 0, height: 0 }), null);
});

test("isFullBleed treats a near-covering box (90% coverage) as full-bleed", () => {
  // A screenshot box with a small gap above: top 7.7%, height 93%, full width.
  assert.equal(isFullBleed({ left: 0, top: 7.7, width: 100, height: 93 }), true);
  // Exactly at the loosened 90% coverage threshold on both axes.
  assert.equal(isFullBleed({ left: 5, top: 5, width: 90, height: 90 }), true);
});

test("isFullBleed rejects a clearly-inset small box", () => {
  assert.equal(isFullBleed({ left: 20, top: 20, width: 50, height: 50 }), false);
});

function deckWithMaster(masterName: string, useHeuristics: boolean) {
  const registry = buildRegistry([
    mockObject(1n, T.documentArchive, { show: ref(2n) }),
    mockObject(2n, T.showArchive, { slideTree: { slides: [ref(10n)] }, size: { width: 1920, height: 1080 } }),
    mockObject(10n, T.slideArchive, { ownedDrawables: [], drawablesZOrder: [], templateSlide: ref(90n) }),
    mockObject(90n, T.slideArchive, { name: masterName, ownedDrawables: [], drawablesZOrder: [] }),
  ]);
  return buildPresentation(registry, "x", new Map(), useHeuristics).slides[0];
}

test("buildPresentation sets className from the master name when useHeuristics is on", () => {
  assert.equal(deckWithMaster("Comparison", true).className, "two-column");
});

test("buildPresentation leaves className undefined when useHeuristics is off", () => {
  assert.equal(deckWithMaster("Comparison", false).className, undefined);
});
