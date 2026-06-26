import assert from "node:assert/strict";
import { test } from "node:test";
import { fontFamilyValue, genericFallback } from "./font-fallback.ts";

test("genericFallback guesses a generic family from the font name", () => {
  assert.equal(genericFallback("Fira Code Nerd Font CM"), "monospace");
  assert.equal(genericFallback("Menlo"), "monospace");
  assert.equal(genericFallback("Shopify Sans"), "sans-serif");
  assert.equal(genericFallback("Times New Serif"), "serif");
  assert.equal(genericFallback("Brush Script MT"), "cursive");
  // Unknown names default to sans-serif.
  assert.equal(genericFallback("Impact"), "sans-serif");
});

test("fontFamilyValue quotes the font and appends its generic fallback", () => {
  assert.equal(fontFamilyValue("Fira Code"), '"Fira Code", monospace');
  assert.equal(fontFamilyValue("Shopify Sans"), '"Shopify Sans", sans-serif');
});
