import assert from "node:assert/strict";
import { test } from "node:test";
import { hoistStyles, parseStyleDeclarations, styleBodyToCss } from "./hoist.ts";

test("parseStyleDeclarations keeps an rgba()'s internal commas inside one declaration", () => {
  assert.deepEqual(parseStyleDeclarations('backgroundColor: "rgba(34, 50, 116, 0.151)", zIndex: 0'), [
    { property: "backgroundColor", value: '"rgba(34, 50, 116, 0.151)"' },
    { property: "zIndex", value: "0" },
  ]);
});

test("styleBodyToCss kebab-cases properties, unwraps strings, and leaves numbers/vars bare", () => {
  assert.equal(
    styleBodyToCss('position: "absolute", zIndex: 2, pointerEvents: "none", color: "var(--palette1)"'),
    ["  position: absolute;", "  z-index: 2;", "  pointer-events: none;", "  color: var(--palette1);"].join("\n"),
  );
});

test("styleBodyToCss renders the vendor-prefixed WebkitTextStroke property", () => {
  assert.equal(styleBodyToCss('WebkitTextStroke: "5px var(--palette1)"'), "  -webkit-text-stroke: 5px var(--palette1);");
});

test("hoistStyles substitutes a 2+-use color across style values (an svg <use> fill and a textShadow string)", () => {
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    '<svg><use href="#kn-p1" style={{ fill: "#000000", stroke: "none" }} /></svg>',
    '<div style={{ textShadow: "0px 0px 4px #000000" }}>x</div>',
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck");

  assert.match(rules.join("\n"), /--palette1: #000000;/);
  assert.match(out, /fill: "var\(--palette1\)"/);
  assert.match(out, /textShadow: "0px 0px 4px var\(--palette1\)"/);
});

test("hoistStyles appends a hoisted class to an element that already has a className", () => {
  const repeated = 'style={{ position: "absolute", zIndex: 0 }}';
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<div className="tint" ${repeated} />`,
    `<div ${repeated} />`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out } = hoistStyles(wrapper, ".slides.deck");

  assert.match(out, /<div className="tint style1" \/>/);
  assert.match(out, /<div className="style1" \/>/);
});

test("hoistStyles leaves component (capitalized) elements' style sets inline, only substituting colors", () => {
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    '<Slide style={{ backgroundColor: "#223274" }} />',
    '<Slide style={{ backgroundColor: "#223274" }} />',
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck");

  // Color is varied (used twice) but the set is NOT hoisted to a class on a component.
  assert.match(rules.join("\n"), /--palette1: #223274;/);
  assert.equal((out.match(/<Slide style=\{\{ backgroundColor: "var\(--palette1\)" \}\} \/>/g) ?? []).length, 2);
  assert.doesNotMatch(out, /className="style/);
});
