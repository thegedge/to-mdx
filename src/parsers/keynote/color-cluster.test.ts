import assert from "node:assert/strict";
import { test } from "node:test";
import { buildColorVars } from "./color-cluster.ts";

test("buildColorVars merges near-identical colors into one averaged variable", () => {
  const { replacements, definitions } = buildColorVars([
    { color: "#223274", count: 3 },
    { color: "#213274", count: 2 }, // 1 away from #223274 → same cluster
    { color: "#ff0000", count: 2 }, // far → its own
  ]);

  assert.equal(definitions.length, 2);
  const blue = definitions.find((d) => d.name.startsWith("blue"));
  assert.ok(blue, "a blue variable exists");
  // Both near blues collapse to the one (averaged) blue variable.
  assert.equal(replacements.get("#223274"), `var(--${blue.name})`);
  assert.equal(replacements.get("#213274"), `var(--${blue.name})`);
  assert.equal(replacements.get("#ff0000"), "var(--red1)");
});

test("buildColorVars derives a translucent color from its cluster base via relative-color syntax", () => {
  const { replacements, definitions } = buildColorVars([
    { color: "#223274", count: 3 },
    { color: "rgba(34, 50, 116, 0.15)", count: 2 }, // same RGB, translucent
  ]);

  // One base variable; the opaque color uses it, the translucent one re-adds alpha.
  assert.equal(definitions.length, 1);
  assert.equal(replacements.get("#223274"), "var(--blue1)");
  assert.equal(replacements.get("rgba(34, 50, 116, 0.15)"), "rgb(from var(--blue1) r g b / 0.15)");
});

test("buildColorVars leaves a color used fewer than twice (alone in its cluster) literal", () => {
  const { replacements, definitions } = buildColorVars([{ color: "#abcdef", count: 1 }]);
  assert.equal(definitions.length, 0);
  assert.equal(replacements.get("#abcdef"), undefined);
});
