import assert from "node:assert/strict";
import { test } from "node:test";
import { alignmentToken, boxPercent, colorToHex, fontSizeToken } from "./style.ts";

test("fontSizeToken maps a point size to the nearest --text-* token", () => {
  assert.equal(fontSizeToken(36), "var(--text-4xl)");
  assert.equal(fontSizeToken(16), "var(--text-base)");
  assert.equal(fontSizeToken(17), "var(--text-base)");
  assert.equal(fontSizeToken(19), "var(--text-lg)");
});

test("fontSizeToken caps at the ends of the scale", () => {
  assert.equal(fontSizeToken(100), "var(--text-6xl)");
  assert.equal(fontSizeToken(1), "var(--text-4xs)");
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
