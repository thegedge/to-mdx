import assert from "node:assert/strict";
import { test } from "node:test";
import type { Presentation } from "./model.ts";
import { presentationToMdx } from "./render.ts";

test("presentationToMdx renders title as H1 and body as a depth-nested bullet list", () => {
  const presentation: Presentation = {
    title: "Deck",
    slides: [
      {
        title: "Intro",
        body: [
          { depth: 0, text: "Top" },
          { depth: 1, text: "Nested" },
          { depth: 2, text: "Deeper" },
        ],
        textBoxes: [],
        images: [],
        videos: [],
        tableCount: 0,
        notes: [],
      },
    ],
  };

  assert.equal(
    presentationToMdx(presentation, "2026-01-01_deck"),
    ["# Intro", "", "- Top", "  - Nested", "    - Deeper"].join("\n"),
  );
});

test("presentationToMdx joins slides with a thematic break and embeds images by basename", () => {
  const presentation: Presentation = {
    title: "Deck",
    slides: [
      { title: "One", body: [], textBoxes: [], images: [], videos: [], tableCount: 0, notes: [] },
      {
        body: [],
        textBoxes: [],
        images: [{ fileName: "pic.png", altText: "alt" }],
        videos: [],
        tableCount: 0,
        notes: [],
      },
    ],
  };

  assert.equal(
    presentationToMdx(presentation, "base"),
    ["# One", "", "---", "", "![alt](/img/presentations/base/pic.png)"].join("\n"),
  );
});

test("presentationToMdx renders a code text box as a fenced block with its language", () => {
  const presentation: Presentation = {
    title: "Deck",
    slides: [
      {
        body: [],
        textBoxes: [{ kind: "code", language: "ruby", text: "def foo\n  bar\nend" }],
        images: [],
        videos: [],
        tableCount: 0,
        notes: [],
      },
    ],
  };

  assert.equal(presentationToMdx(presentation, "base"), "```ruby\ndef foo\n  bar\nend\n```");
});

test("presentationToMdx emits table, video and presenter-note comments", () => {
  const presentation: Presentation = {
    title: "Deck",
    slides: [
      {
        body: [],
        textBoxes: [],
        images: [],
        videos: ["clip.mov"],
        tableCount: 2,
        notes: [{ depth: 0, text: "remember this" }],
      },
    ],
  };

  const mdx = presentationToMdx(presentation, "base");
  assert.match(mdx, /\{\/\* 2 table\(s\)/);
  assert.match(mdx, /\{\/\* video: \/img\/presentations\/base\/clip\.mov \*\/\}/);
  assert.match(mdx, /Presenter notes:\nremember this/);
});
