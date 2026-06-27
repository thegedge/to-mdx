import assert from "node:assert/strict";
import { test } from "node:test";
import { colorName } from "./color-name.ts";

test("colorName buckets a color by its hue", () => {
  assert.equal(colorName("#223274"), "blue");
  assert.equal(colorName("#fb8b8a"), "red");
  assert.equal(colorName("#fdd991"), "orange");
  assert.equal(colorName("#44bebf"), "cyan");
  assert.equal(colorName("rgba(34, 50, 116, 0.15)"), "blue");
});

test("colorName names grayscale colors by lightness", () => {
  assert.equal(colorName("#000000"), "black");
  assert.equal(colorName("#222222"), "black");
  assert.equal(colorName("#525659"), "gray");
  assert.equal(colorName("#ffffff"), "white");
});

test("colorName expands 3-digit hex and falls back to 'color' for the unparseable", () => {
  assert.equal(colorName("#f00"), "red");
  assert.equal(colorName("currentColor"), "color");
  assert.equal(colorName("nonsense"), "color");
});
