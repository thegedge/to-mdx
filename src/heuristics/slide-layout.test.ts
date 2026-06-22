import assert from "node:assert/strict";
import { test } from "node:test";
import { centeringLayoutClass } from "./slide-layout.ts";

test("centeringLayoutClass returns 'centered' for a box centred on both axes", () => {
  assert.equal(centeringLayoutClass({ left: 30, top: 30, width: 40, height: 40 }), "centered");
});

test("centeringLayoutClass returns 'centered blank' when the box also spans the full width", () => {
  assert.equal(centeringLayoutClass({ left: 0, top: 30, width: 100, height: 40 }), "centered blank");
});

test("centeringLayoutClass returns 'centered blank' when the box also spans the full height", () => {
  assert.equal(centeringLayoutClass({ left: 30, top: 0, width: 40, height: 100 }), "centered blank");
});

test("centeringLayoutClass returns null at and below the centring threshold boundaries", () => {
  // centerX/centerY of exactly 45 are excluded (strictly greater than 45 required).
  assert.equal(centeringLayoutClass({ left: 25, top: 25, width: 40, height: 40 }), null);
  // centerX of exactly 65 is excluded (strictly less than 65 required).
  assert.equal(centeringLayoutClass({ left: 45, top: 30, width: 40, height: 40 }), null);
});

test("centeringLayoutClass returns null for non-finite values", () => {
  assert.equal(centeringLayoutClass({ left: NaN, top: NaN, width: NaN, height: NaN }), null);
});
