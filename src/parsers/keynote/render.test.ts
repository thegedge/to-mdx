import assert from "node:assert/strict";
import { test } from "node:test";
import type { Presentation, Slide } from "./model.ts";
import { assembleMdxDocument, escapeMdxText, positionRules, presentationToMdx } from "./render.ts";

function slide(overrides: Partial<Slide> = {}): Slide {
  return { body: [], textBoxes: [], images: [], videos: [], tables: [], tableCount: 0, notes: [], ...overrides };
}

function deck(slides: Slide[], unplacedImages: string[] = [], title = "Deck"): Presentation {
  return { title, slides, unplacedImages };
}

test("escapeMdxText escapes the MDX-significant < > { } characters", () => {
  assert.equal(escapeMdxText("<click>"), "&lt;click&gt;");
  assert.equal(escapeMdxText("a {b} c"), "a &#123;b&#125; c");
  assert.equal(escapeMdxText(">"), "&gt;");
  assert.equal(escapeMdxText("}"), "&#125;");
  assert.equal(escapeMdxText("a > b"), "a &gt; b");
  assert.equal(escapeMdxText("plain text 100% safe"), "plain text 100% safe");
});

test("presentationToMdx fully escapes < > and { } in a speaker note instead of emitting raw JSX", () => {
  const mdx = presentationToMdx(deck([slide({ notes: [{ depth: 0, text: "press <click> when a > b" }] })]));
  assert.doesNotMatch(mdx, /<click>/);
  assert.doesNotMatch(mdx, / > /);
  assert.match(mdx, /press &lt;click&gt; when a &gt; b/);
});

test("presentationToMdx escapes < > { } in titles, bullets, and prose text boxes", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        title: "<Heading>",
        body: [{ depth: 0, text: "use {value}" }],
        textBoxes: [{ kind: "text", paragraphs: [{ depth: 0, text: "a <b> {c}" }] }],
      }),
    ]),
  );
  assert.doesNotMatch(mdx, /<Heading>/);
  assert.match(mdx, /# &lt;Heading&gt;/);
  assert.match(mdx, /- use &#123;value&#125;/);
  assert.match(mdx, /a &lt;b&gt; &#123;c&#125;/);
});

test("presentationToMdx emits a code text box verbatim, leaving < > { } unescaped inside the fence", () => {
  const mdx = presentationToMdx(
    deck([slide({ textBoxes: [{ kind: "code", language: "tsx", text: "const x = <T>{1}</T>" }] })]),
  );
  assert.match(mdx, /const x = <T>\{1\}<\/T>/);
  assert.doesNotMatch(mdx, /&lt;/);
  assert.doesNotMatch(mdx, /&gt;/);
  assert.doesNotMatch(mdx, /&#123;/);
  assert.doesNotMatch(mdx, /&#125;/);
});

test("presentationToMdx wraps slides in <Slides> with a title slug and backgroundRoot={imageRoot}", () => {
  const presentation = deck(
    [
      slide({
        title: "Intro",
        body: [
          { depth: 0, text: "Top" },
          { depth: 1, text: "Nested" },
          { depth: 2, text: "Deeper" },
        ],
      }),
    ],
    [],
    "Network Monitor",
  );

  assert.equal(
    presentationToMdx(presentation),
    [
      '<Slides className="network-monitor" backgroundRoot={imageRoot}>',
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
  const mdx = presentationToMdx(deck([slide({ className: "title centered", title: "Hi" })]));
  assert.match(mdx, /<Slide className="title centered">\n {2}# Hi\n<\/Slide>/);
});

test("presentationToMdx renders an empty slide as a self-closing <Slide />", () => {
  assert.equal(
    presentationToMdx(deck([slide()])),
    '<Slides className="deck" backgroundRoot={imageRoot}>\n<Slide />\n</Slides>',
  );
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
    presentationToMdx(presentation),
    [
      '<Slides className="deck" backgroundRoot={imageRoot}>',
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

test("presentationToMdx embeds images as <Image>, videos as <video>, and a table comment inside the slide", () => {
  const mdx = presentationToMdx(
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt" }], videos: ["clip.mov"], tableCount: 2 })]),
  );

  assert.match(mdx, /<Image src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);
  assert.match(mdx, /<video controls src=\{`\$\{imageRoot\}\/clip\.mov`\}><\/video>/);
  assert.match(mdx, /\{\/\* 2 table\(s\) on this slide could not be extracted \*\/\}/);
});

test("presentationToMdx renders an extracted table as escaped HTML with <br/> for newlines", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          {
            rows: [
              ["Header", "a <b>"],
              ["line1\nline2", ""],
            ],
          },
        ],
      }),
    ]),
  );

  assert.match(mdx, /<table>\n {4}<tr><td>Header<\/td><td>a &lt;b&gt;<\/td><\/tr>\n {4}<tr><td>line1<br\/>line2<\/td><td><\/td><\/tr>\n {2}<\/table>/);
});

test("presentationToMdx renders a code text box as a fenced block with its language", () => {
  const mdx = presentationToMdx(deck([slide({ textBoxes: [{ kind: "code", language: "ruby", text: "def foo\n  bar\nend" }] })]));

  assert.equal(
    mdx,
    [
      '<Slides className="deck" backgroundRoot={imageRoot}>',
      "<Slide>",
      "  ```ruby",
      "  def foo",
      "    bar",
      "  end",
      "  ```",
      "</Slide>",
      "</Slides>",
    ].join("\n"),
  );
});

test("presentationToMdx appends the unplaced-images section as <Image> after </Slides>", () => {
  const presentation = deck([slide({ title: "Only" })], ["lost-1.png", "lost-2.png"]);

  assert.equal(
    presentationToMdx(presentation),
    [
      '<Slides className="deck" backgroundRoot={imageRoot}>',
      "<Slide>",
      "  # Only",
      "</Slide>",
      "</Slides>",
      "",
      "{/* Unplaced images: these could not be linked to a slide (container lost to a partially-decoded chunk) */}",
      "",
      "<Image src={`${imageRoot}/lost-1.png`} role=\"presentation\" alt=\"\" />",
      "",
      "<Image src={`${imageRoot}/lost-2.png`} role=\"presentation\" alt=\"\" />",
    ].join("\n"),
  );
});

test("presentationToMdx omits the unplaced-images section when the list is empty", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Only" })]));
  assert.doesNotMatch(mdx, /Unplaced images/);
  assert.match(mdx, /^<Slides className="deck" backgroundRoot=\{imageRoot\}>\n<Slide>\n {2}# Only\n<\/Slide>\n<\/Slides>$/);
});

test("presentationToMdx separates consecutive slides with a blank line", () => {
  const mdx = presentationToMdx(deck([slide({ title: "One" }), slide({ title: "Two" })]));

  assert.equal(
    mdx,
    [
      '<Slides className="deck" backgroundRoot={imageRoot}>',
      "<Slide>",
      "  # One",
      "</Slide>",
      "",
      "<Slide>",
      "  # Two",
      "</Slide>",
      "</Slides>",
    ].join("\n"),
  );
});

test("presentationToMdx emits a scoped <style> block and wraps the positioned box in a kn-box div", () => {
  const mdx = presentationToMdx(
    deck(
      [
        slide({ title: "Flow" }),
        slide({
          textBoxes: [
            {
              kind: "text",
              paragraphs: [{ depth: 0, text: "99.9%" }],
              box: { left: 10, top: 20, width: 30, height: 40 },
              style: { fontSizeToken: "var(--text-4xl)", color: "#ff0000", fontWeight: 700, textAlign: "center" },
            },
          ],
        }),
      ],
      [],
      "Network Monitor",
    ),
  );

  // The style block precedes the deck wrapper and is scoped to the slug.
  assert.match(mdx, /^<style>\{`/);
  assert.match(mdx, /\.slides\.network-monitor \.slide\[data-slide-number="2"\] \.kn-box-0 \{/);
  assert.match(mdx, /position: absolute;/);
  assert.match(mdx, /left: 10%;/);
  assert.match(mdx, /top: 20%;/);
  assert.match(mdx, /width: 30%;/);
  assert.match(mdx, /height: 40%;/);
  assert.match(mdx, /font-size: var\(--text-4xl\);/);
  assert.match(mdx, /color: #ff0000;/);
  assert.match(mdx, /font-weight: 700;/);
  assert.match(mdx, /text-align: center;/);
  // The box itself is wrapped for the selector to target.
  assert.match(mdx, /<div className="kn-box-0">\n\s*99\.9%\n\s*<\/div>/);
});

test("presentationToMdx renders a promoted full-bleed image as the slide background (cover, no contain)", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Bg", background: "x.png", className: "blank" })]));

  assert.match(mdx, /<Slide className="blank" background=\{`\$\{imageRoot\}\/x\.png`\} opaqueBackground>/);
  assert.doesNotMatch(mdx, /backgroundContain/);
});

test("presentationToMdx layers positioned text (z-index 2) above positioned images (z-index 1)", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "label" }], box: { left: 5, top: 5, width: 20, height: 10 } },
        ],
        images: [{ fileName: "diagram.png", altText: "d", box: { left: 10, top: 10, width: 50, height: 50 } }],
      }),
    ]),
  );

  assert.match(mdx, /\.kn-img-0 \{[^}]*z-index: 1;/);
  assert.match(mdx, /\.kn-box-0 \{[^}]*z-index: 2;/);
  // A positioned image carries the kn-img class so its rule targets it.
  assert.match(mdx, /<Image className="kn-img-0" src=\{`\$\{imageRoot\}\/diagram\.png`\}/);
});

test("presentationToMdx omits the <style> block when no text box is positioned or styled", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        title: "Title",
        body: [{ depth: 0, text: "A bullet" }],
        textBoxes: [{ kind: "text", paragraphs: [{ depth: 0, text: "loose caption" }] }],
        images: [{ fileName: "pic.png", altText: "alt" }],
      }),
    ]),
  );

  assert.doesNotMatch(mdx, /<style>/);
  // Title, body, and image stay in normal flow (unpositioned, no kn-box selector).
  assert.match(mdx, /^<Slides /);
  assert.match(mdx, /# Title/);
  assert.match(mdx, /- A bullet/);
  assert.match(mdx, /<Image src=/);
});

test("positionRules anchors a bottom-right auto-size box by its near (right/bottom) edges", () => {
  assert.deepEqual(positionRules({ left: 94.4, top: 97.2, width: 0, height: 0 }), ["right: 5.6%;", "bottom: 2.8%;"]);
});

test("positionRules keeps left/top/width/height for a real-sized box", () => {
  assert.deepEqual(positionRules({ left: 10, top: 20, width: 30, height: 40 }), [
    "left: 10%;",
    "width: 30%;",
    "top: 20%;",
    "height: 40%;",
  ]);
});

test("positionRules anchors a top-left auto-size box by left/top (no width/height)", () => {
  assert.deepEqual(positionRules({ left: 28, top: 12, width: 0, height: 0 }), ["left: 28%;", "top: 12%;"]);
});

test("presentationToMdx anchors a positioned auto-size box without emitting width:0", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "corner" }], box: { left: 94.4, top: 97.2, width: 0, height: 0 } },
        ],
      }),
    ]),
  );

  assert.match(mdx, /right: 5\.6%;/);
  assert.match(mdx, /bottom: 2\.8%;/);
  assert.doesNotMatch(mdx, /width: 0%;/);
  assert.doesNotMatch(mdx, /height: 0%;/);
  assert.doesNotMatch(mdx, /left:/);
  assert.doesNotMatch(mdx, /top:/);
});

test("assembleMdxDocument puts a blank line between the exports and the body, and ends with a newline", () => {
  const doc = assembleMdxDocument("export const title = 'Deck';", "<Slides>\n<Slide />\n</Slides>");

  assert.equal(doc, "export const title = 'Deck';\n\n<Slides>\n<Slide />\n</Slides>\n");
  assert.match(doc, /;\n\n<Slides>/);
});
