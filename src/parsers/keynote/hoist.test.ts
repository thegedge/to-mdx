import assert from "node:assert/strict";
import { test } from "node:test";
import { declarationBody, hoistStyles, StyleCollector } from "./hoist.ts";

test("declarationBody quotes string values and leaves numbers bare", () => {
  assert.equal(
    declarationBody([
      ["position", "absolute"],
      ["zIndex", 0],
      ["backgroundColor", "rgba(34, 50, 116, 0.151)"],
    ]),
    'position: "absolute", zIndex: 0, backgroundColor: "rgba(34, 50, 116, 0.151)"',
  );
  assert.equal(declarationBody([]), "");
});

test("hoistStyles substitutes a 2+-use color across declaration values (an svg <use> fill and a textShadow)", () => {
  const collector = new StyleCollector();
  const useStyle = collector.add([["fill", "#000000"], ["stroke", "none"]]);
  const divStyle = collector.add([["textShadow", "0px 0px 4px #000000"]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<svg><use href="#kn-p1" ${useStyle} /></svg>`,
    `<div ${divStyle}>x</div>`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  assert.match(rules.join("\n"), /--black1: #000000;/);
  assert.match(out, /fill: "var\(--black1\)"/);
  assert.match(out, /textShadow: "0px 0px 4px var\(--black1\)"/);
});

test("hoistStyles leaves a single-use color literal and gives it no variable", () => {
  const collector = new StyleCollector();
  // Distinct sets (differing zIndex) so the repeated color is varied without the
  // whole set being hoisted to a shared class.
  const a = collector.add([["color", "#223274"], ["zIndex", 1]]);
  const b = collector.add([["color", "#223274"], ["zIndex", 2]]);
  const once = collector.add([["color", "#abcdef"]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<div ${a}>a</div>`,
    `<div ${b}>b</div>`,
    `<div ${once}>c</div>`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  assert.match(rules.join("\n"), /--blue1: #223274;/);
  assert.match(out, /color: "var\(--blue1\)"/);
  // The single-use color is untouched and gets no variable.
  assert.match(out, /color: "#abcdef"/);
  assert.doesNotMatch(rules.join("\n"), /#abcdef/);
});

test("hoistStyles makes the most-common fontFamily the scope default and drops every inline fontFamily", () => {
  const collector = new StyleCollector();
  const common1 = collector.add([["fontFamily", "Shopify Sans"]]);
  const common2 = collector.add([["fontFamily", "Shopify Sans"]]);
  const rare = collector.add([["fontFamily", "Fira Code"]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<div ${common1}>a</div>`,
    `<div ${common2}>b</div>`,
    `<div ${rare}>code</div>`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  // Common family is the scope default; the rare one is a utility class on its element.
  assert.match(rules.join("\n"), /\.slides\.deck \{\n {2}font-family: "Shopify Sans";\n\}/);
  assert.match(rules.join("\n"), /\.slides\.deck \.font-fira-code \{\n {2}font-family: "Fira Code";\n\}/);
  assert.match(out, /<div className="font-fira-code">code<\/div>/);
  // No inline fontFamily survives anywhere.
  assert.doesNotMatch(out, /fontFamily/);
});

test("hoistStyles hoists an identical 2+-use style set on intrinsic elements to one shared class", () => {
  const collector = new StyleCollector();
  const declarations = [["position", "absolute"], ["overflow", "hidden"], ["zIndex", 1]] as const;
  const a = collector.add([...declarations]);
  const b = collector.add([...declarations]);
  const unique = collector.add([["position", "absolute"], ["zIndex", 9]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<div ${a}>a</div>`,
    `<div ${b}>b</div>`,
    `<div ${unique}>c</div>`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  assert.match(rules.join("\n"), /\.slides\.deck \.style1 \{\n {2}position: absolute;\n {2}overflow: hidden;\n {2}z-index: 1;\n\}/);
  assert.equal((out.match(/className="style1"/g) ?? []).length, 2);
  assert.doesNotMatch(out, /overflow: "hidden"/);
  // The unique style set stays inline (not classed).
  assert.match(out, /<div style=\{\{ position: "absolute", zIndex: 9 \}\}>c<\/div>/);
});

test("hoistStyles appends a hoisted class to an element that already has a className", () => {
  const collector = new StyleCollector();
  const a = collector.add([["position", "absolute"], ["zIndex", 0]]);
  const b = collector.add([["position", "absolute"], ["zIndex", 0]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<div className="tint" ${a} />`,
    `<div ${b} />`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out } = hoistStyles(wrapper, ".slides.deck", collector);

  assert.match(out, /<div className="tint style1" \/>/);
  assert.match(out, /<div className="style1" \/>/);
});

test("hoistStyles leaves component (capitalized) elements' style sets inline, only substituting colors", () => {
  const collector = new StyleCollector();
  const a = collector.add([["backgroundColor", "#223274"]]);
  const b = collector.add([["backgroundColor", "#223274"]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<Slide ${a} />`,
    `<Slide ${b} />`,
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  // Color is varied (used twice) but the set is NOT hoisted to a class on a component.
  assert.match(rules.join("\n"), /--blue1: #223274;/);
  assert.equal((out.match(/<Slide style=\{\{ backgroundColor: "var\(--blue1\)" \}\} \/>/g) ?? []).length, 2);
  assert.doesNotMatch(out, /className="style/);
});
