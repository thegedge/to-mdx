import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, mockObject, ref } from "../test_support.ts";
import { KeynoteType } from "../types.ts";
import { owningSlideId } from "./ownership.ts";

const T = KeynoteType;

test("owningSlideId walks two groups deep up to the content slide", () => {
  const registry = buildRegistry([
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(50n)], drawablesZOrder: [] }),
    mockObject(50n, T.groupArchive, { super: { parent: ref(10n) }, children: [ref(60n)] }),
    mockObject(60n, T.groupArchive, { super: { parent: ref(50n) }, children: [ref(70n)] }),
    mockObject(70n, T.imageArchive, { super: { parent: ref(60n) }, data: ref(700n) }),
  ]);

  const image = registry.get(70n);
  assert.ok(image);
  assert.equal(owningSlideId(image, registry, new Set([10n])), 10n);
});

test("owningSlideId returns undefined when the parent chain is severed by a missing ref", () => {
  const registry = buildRegistry([
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(60n)], drawablesZOrder: [] }),
    // Group 60n's parent (888n) was lost to a dropped chunk: the walk dead-ends.
    mockObject(60n, T.groupArchive, { super: { parent: ref(888n) }, children: [ref(70n)] }),
    mockObject(70n, T.imageArchive, { super: { parent: ref(60n) }, data: ref(700n) }),
  ]);

  const image = registry.get(70n);
  assert.ok(image);
  assert.equal(owningSlideId(image, registry, new Set([10n])), undefined);
});

test("owningSlideId excludes a drawable owned by a non-content (master) slide", () => {
  const registry = buildRegistry([
    // 90n is a master slide, not part of the presentation's content-slide set.
    mockObject(90n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    mockObject(70n, T.imageArchive, { super: { parent: ref(90n) }, data: ref(700n) }),
  ]);

  const image = registry.get(70n);
  assert.ok(image);
  assert.equal(owningSlideId(image, registry, new Set([10n])), undefined);
});

test("owningSlideId resolves a ShapeInfo-style super.super.parent chain", () => {
  const registry = buildRegistry([
    mockObject(10n, T.slideArchive, { ownedDrawables: [ref(70n)], drawablesZOrder: [] }),
    // ShapeInfoArchive nests parent two supers down (super → ShapeArchive → DrawableArchive).
    mockObject(70n, T.shapeInfoArchive, { super: { super: { parent: ref(10n) } } }),
  ]);

  const shape = registry.get(70n);
  assert.ok(shape);
  assert.equal(owningSlideId(shape, registry, new Set([10n])), 10n);
});
