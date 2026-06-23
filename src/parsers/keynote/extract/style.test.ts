import assert from "node:assert/strict";
import { test } from "node:test";
import { alignmentToken, boxPercent, colorToHex, fontFamily, fontSizeToken } from "./style.ts";

test("fontSizeToken maps a raw point size to the nearest --text-* token without a slide height", () => {
  assert.equal(fontSizeToken(36), "var(--text-4xl)");
  assert.equal(fontSizeToken(16), "var(--text-base)");
  assert.equal(fontSizeToken(17), "var(--text-base)");
  assert.equal(fontSizeToken(19), "var(--text-lg)");
});

test("fontSizeToken maps the large display sizes onto the extended token scale", () => {
  assert.equal(fontSizeToken(72), "var(--text-7xl)");
  assert.equal(fontSizeToken(96), "var(--text-8xl)");
});

test("fontSizeToken caps at the ends of the scale", () => {
  assert.equal(fontSizeToken(150), "var(--text-9xl)");
  assert.equal(fontSizeToken(1), "var(--text-4xs)");
});

test("fontSizeToken scales by the font's fraction of slide height", () => {
  // ~36pt body text on a 1080-tall slide reads as ordinary body copy, not --text-4xl.
  assert.equal(fontSizeToken(36, 1080), "var(--text-lg)");
  // A giant 200pt emoji tops out below the extreme token.
  assert.equal(fontSizeToken(200, 1080), "var(--text-8xl)");
  // The same point size is smaller on a taller slide.
  assert.equal(fontSizeToken(72, 1080), "var(--text-4xl)");
  assert.equal(fontSizeToken(72, 2160), "var(--text-lg)");
});

test("fontSizeToken falls back to the raw point size for a degenerate slide height", () => {
  assert.equal(fontSizeToken(36, 0), "var(--text-4xl)");
});

test("colorToHex converts 0–1 RGB floats to #RRGGBB", () => {
  assert.equal(colorToHex({ r: 1, g: 1, b: 0 }), "#ffff00");
  assert.equal(colorToHex({ r: 0, g: 0, b: 0 }), "#000000");
  assert.equal(colorToHex({ r: 1, g: 1, b: 1 }), "#ffffff");
});

test("colorToHex clamps out-of-range channels and treats missing ones as 0", () => {
  assert.equal(colorToHex({ r: 2, g: -1, b: 0.5 }), "#ff0080");
  assert.equal(colorToHex({ r: 1 }), "#ff0000");
});

test("fontFamily strips a trailing weight suffix and splits camelCase into words", () => {
  assert.equal(fontFamily("ShopifySans-Light"), "Shopify Sans");
  assert.equal(fontFamily("Impact"), "Impact");
  assert.equal(fontFamily("Helvetica-Bold"), "Helvetica");
  assert.equal(fontFamily(undefined), undefined);
  assert.equal(fontFamily(""), undefined);
});

test("alignmentToken maps the iWork alignment enum to CSS text-align", () => {
  assert.equal(alignmentToken(0), "left");
  assert.equal(alignmentToken(1), "right");
  assert.equal(alignmentToken(2), "center");
  assert.equal(alignmentToken(3), "justify");
  assert.equal(alignmentToken(4), undefined);
  assert.equal(alignmentToken(undefined), undefined);
});

test("boxPercent expresses a point-space box as slide-size percentages", () => {
  assert.deepEqual(boxPercent({ x: 192, y: 108, width: 960, height: 540 }, { width: 1920, height: 1080 }), {
    left: 10,
    top: 10,
    width: 50,
    height: 50,
  });
});

test("boxPercent returns undefined for a missing box or degenerate slide size", () => {
  assert.equal(boxPercent(undefined, { width: 1920, height: 1080 }), undefined);
  assert.equal(boxPercent({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }), undefined);
});
