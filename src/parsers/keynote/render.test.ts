import assert from "node:assert/strict";
import { test } from "node:test";
import type { Presentation, Slide } from "./model.ts";
import { presentationToMdx } from "./render.ts";

function slide(overrides: Partial<Slide> = {}): Slide {
  return { body: [], textBoxes: [], images: [], videos: [], tableCount: 0, notes: [], ...overrides };
}

function deck(slides: Slide[], unplacedImages: string[] = []): Presentation {
  return { title: "Deck", slides, unplacedImages };
}

test("presentationToMdx wraps all slides in <Slides> and a slide in <Slide> with indented content", () => {
  const presentation = deck([
    slide({
      title: "Intro",
      body: [
        { depth: 0, text: "Top" },
        { depth: 1, text: "Nested" },
        { depth: 2, text: "Deeper" },
      ],
    }),
  ]);

  assert.equal(
    presentationToMdx(presentation, "2026-01-01_deck"),
    [
      "<Slides>",
      "<Slide>",
      "  # Intro",
      "",
      "  - Top",
      "    - Nested",
      "      - Deeper",
      "</Slide>",
      "</Slides>",
    ].join("\n"),
  );
});

test("presentationToMdx renders a className on the <Slide> tag when present", () => {
  const mdx = presentationToMdx(deck([slide({ className: "title centered", title: "Hi" })]), "base");
  assert.match(mdx, /<Slide className="title centered">\n {2}# Hi\n<\/Slide>/);
});

test("presentationToMdx renders an empty slide as a self-closing <Slide />", () => {
  assert.equal(presentationToMdx(deck([slide()]), "base"), "<Slides>\n<Slide />\n</Slides>");
});

test("presentationToMdx renders speaker notes as a nested unordered list inside <SpeakerNotes>", () => {
  const presentation = deck([
    slide({
      title: "Talk",
      notes: [
        { depth: 0, text: "Open strong" },
        { depth: 1, text: "Cite the metric" },
      ],
    }),
  ]);

  assert.equal(
    presentationToMdx(presentation, "base"),
    [
      "<Slides>",
      "<Slide>",
      "  # Talk",
      "",
      "  <SpeakerNotes>",
      "    - Open strong",
      "      - Cite the metric",
      "  </SpeakerNotes>",
      "</Slide>",
      "</Slides>",
    ].join("\n"),
  );
});

test("presentationToMdx embeds images and emits table/video comments inside the slide", () => {
  const mdx = presentationToMdx(
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt" }], videos: ["clip.mov"], tableCount: 2 })]),
    "base",
  );

  assert.match(mdx, /!\[alt\]\(\/img\/presentations\/base\/pic\.png\)/);
  assert.match(mdx, /\{\/\* video: \/img\/presentations\/base\/clip\.mov \*\/\}/);
  assert.match(mdx, /\{\/\* 2 table\(s\) on this slide were not extracted \*\/\}/);
});

test("presentationToMdx renders a code text box as a fenced block with its language", () => {
  const mdx = presentationToMdx(
    deck([slide({ textBoxes: [{ kind: "code", language: "ruby", text: "def foo\n  bar\nend" }] })]),
    "base",
  );

  assert.equal(
    mdx,
    ["<Slides>", "<Slide>", "  ```ruby", "  def foo", "    bar", "  end", "  ```", "</Slide>", "</Slides>"].join("\n"),
  );
});

test("presentationToMdx appends the unplaced-images section after </Slides>", () => {
  const presentation = deck([slide({ title: "Only" })], ["lost-1.png", "lost-2.png"]);

  assert.equal(
    presentationToMdx(presentation, "base"),
    [
      "<Slides>",
      "<Slide>",
      "  # Only",
      "</Slide>",
      "</Slides>",
      "",
      "{/* Unplaced images: these could not be linked to a slide (container lost to a partially-decoded chunk) */}",
      "",
      "![image](/img/presentations/base/lost-1.png)",
      "",
      "![image](/img/presentations/base/lost-2.png)",
    ].join("\n"),
  );
});

test("presentationToMdx omits the unplaced-images section when the list is empty", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Only" })]), "base");
  assert.doesNotMatch(mdx, /Unplaced images/);
  assert.match(mdx, /^<Slides>\n<Slide>\n {2}# Only\n<\/Slide>\n<\/Slides>$/);
});
