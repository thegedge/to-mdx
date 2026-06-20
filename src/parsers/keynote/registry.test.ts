import assert from "node:assert/strict";
import { test } from "node:test";
import { Registry } from "./registry.ts";
import { mockObject as iwaObject } from "./test_support.ts";

test("add indexes objects by identifier and exposes type", () => {
  const registry = new Registry();
  registry.add(iwaObject(10n, 5, { name: "slide" }));

  assert.equal(registry.size, 1);
  assert.deepEqual(registry.get(10n), { id: 10n, type: 5, message: { name: "slide" } });
});

test("add ignores objects with no identifier or no messages", () => {
  const registry = new Registry();
  registry.add({ offset: 0, length: 0, messages: [] });
  registry.add({ identifier: 1n, offset: 0, length: 0, messages: [] });

  assert.equal(registry.size, 0);
});

test("resolve follows a reference and returns the decoded message", () => {
  const registry = new Registry();
  registry.add(iwaObject(7n, 2001, { text: ["hi"] }));

  const resolved = registry.resolve<{ text: string[] }>({ identifier: 7n });
  assert.deepEqual(resolved, { text: ["hi"] });
});

test("resolve records a single warning for an unresolved reference", () => {
  const registry = new Registry();
  assert.equal(registry.resolve({ identifier: 99n }), undefined);
  assert.equal(registry.resolve({ identifier: 99n }), undefined);

  assert.deepEqual(registry.warnings, ["Unresolved reference: 99"]);
});

test("entriesOfType and firstOfType filter by message type", () => {
  const registry = new Registry();
  registry.add(iwaObject(1n, 5, "a"));
  registry.add(iwaObject(2n, 5, "b"));
  registry.add(iwaObject(3n, 2, "c"));

  assert.equal(registry.entriesOfType(5).length, 2);
  assert.equal(registry.firstOfType(2)?.message, "c");
  assert.equal(registry.firstOfType(404), undefined);
});

test("typeCounts produces a histogram keyed by type", () => {
  const registry = new Registry();
  registry.add(iwaObject(1n, 5, "a"));
  registry.add(iwaObject(2n, 5, "b"));
  registry.add(iwaObject(3n, 2, "c"));

  assert.deepEqual(registry.typeCounts(), { "5": 2, "2": 1 });
});
