import assert from "node:assert/strict";
import { test } from "node:test";
import type { Presentation, Slide } from "./model.ts";
import { hoistStyles, StyleCollector } from "./hoist.ts";
import { assembleMdxDocument, escapeMdxText, isImageFile, positionRules, presentationToMdx, styleAttr } from "./render.ts";

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

test("presentationToMdx renders comparison-slide metrics as semantic flow .metric blocks", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        className: "comparison",
        title: "Traffic",
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "83k" }, { depth: 0, text: "req/s" }], box: { left: 28, top: 54, width: 0, height: 0 } },
          { kind: "text", paragraphs: [{ depth: 0, text: "Source: X" }], box: { left: 90, top: 97, width: 0, height: 0 } },
        ],
      }),
    ]),
  );
  // The central metric becomes a flow .metric block (value + label) inside a .metrics container.
  assert.match(mdx, /<div className="metrics">\n\s*<div className="metric">\n\s*<p className="value">83k<\/p>\n\s*<p className="label">req\/s<\/p>\n\s*<\/div>/);
  assert.doesNotMatch(mdx, /<p className="value">Source/);
  // The edge credit stays an absolutely-positioned box.
  assert.match(mdx, /position: "absolute"[^>]*>\n\s*Source: X/);
});

test("presentationToMdx wraps a hyperlinked paragraph in a markdown link (bullet and prose)", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        body: [{ depth: 0, text: "see the docs", link: "https://example.com" }],
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "Attribution: https://ex.com", link: "https://ex.com" }],
            box: { left: 10, top: 80, width: 0, height: 0 },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /- \[see the docs\]\(https:\/\/example\.com\)/);
  assert.match(mdx, /\[Attribution: https:\/\/ex\.com\]\(https:\/\/ex\.com\)/);
});

test("presentationToMdx renders placeholder title/body as clean markdown while a free box stays positioned", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        title: "Takeaways",
        body: [{ depth: 0, text: "First point" }],
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "99.9%" }],
            box: { left: 10, top: 20, width: 30, height: 40 },
            style: { color: "#fdd991" },
          },
        ],
      }),
    ]),
  );
  // Title/body are flow markdown with no inline style on them.
  assert.match(mdx, /# Takeaways/);
  assert.match(mdx, /- First point/);
  assert.doesNotMatch(mdx, /# Takeaways[^\n]*style=\{\{/);
  // The free label keeps its absolute positioning + color.
  assert.match(mdx, /<div style=\{\{ position: "absolute"[^}]*color: "#fdd991"[^}]*\}\}>/);
  assert.match(mdx, /99\.9%/);
});

test("presentationToMdx emits a free text box's shape-fill background (with padding) on its div", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "user program" }],
            box: { left: 5, top: 5, width: 20, height: 10 },
            style: { color: "#253170", backgroundColor: "#f9db9a" },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /backgroundColor: "#f9db9a"/);
  assert.match(mdx, /padding: "0\.2em 0\.4em"/);
});

test("presentationToMdx renders a smart-brush border as a rough-filtered SVG overlay, with the filter emitted once and no CSS border", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "retransmission timer" }],
            box: { left: 10, top: 20, width: 15, height: 8 },
            style: { brushBorder: { color: "#223274", width: 4 } },
          },
        ],
      }),
    ]),
  );
  // The inner overlay: an <svg> holding a single rough-filtered <rect>.
  assert.match(mdx, /<svg aria-hidden="true"[^>]*>\s*<rect[^>]*filter="url\(#kn-rough\)"/);
  assert.match(mdx, /stroke="#223274" strokeWidth=\{4\}/);
  // No flat CSS border on a brush-bordered box.
  assert.doesNotMatch(mdx, /border: "/);
  // The filter def appears exactly once in the document defs.
  const filters = mdx.match(/<filter id="kn-rough"/g) ?? [];
  assert.equal(filters.length, 1);
});

test("presentationToMdx gives a plain-stroke box a CSS border and emits no brush overlay or rough filter", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "plain box" }],
            box: { left: 10, top: 20, width: 15, height: 8 },
            style: { border: "2px solid #223274" },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /border: "2px solid #223274"/);
  assert.doesNotMatch(mdx, /kn-rough/);
  assert.doesNotMatch(mdx, /<rect/);
});

test("presentationToMdx flex-centers a filled diagram-label box both ways with textAlign center", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "verifier" }],
            box: { left: 10, top: 20, width: 15, height: 8 },
            style: { backgroundColor: "#f9db9a", borderRadius: "8.9%" },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /display: "flex"/);
  assert.match(mdx, /flexDirection: "column"/);
  assert.match(mdx, /justifyContent: "center"/);
  assert.match(mdx, /alignItems: "center"/);
  assert.match(mdx, /textAlign: "center"/);
  assert.match(mdx, /borderRadius: "8\.9%"/);
});

test("presentationToMdx rotates a rotated text box about its centre via transform", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "SYN" }],
            box: { left: 30, top: 40, width: 8, height: 5 },
            style: { rotation: 10 },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /transform: "rotate\(10deg\)"/);
});

test("presentationToMdx composes the auto-size centre shift and rotation into one transform", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "Data 1" }],
            box: { left: 30, top: 40, width: 0, height: 0 },
            style: { backgroundColor: "#ffffff", rotation: 4 },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /transform: "translate\(-50%, -50%\) rotate\(4deg\)"/);
});

test("presentationToMdx does not flex-center an unfilled (flow-style) text box", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "a caption" }],
            box: { left: 10, top: 20, width: 15, height: 8 },
            style: { color: "#ffffff", textAlign: "left" },
          },
        ],
      }),
    ]),
  );
  assert.doesNotMatch(mdx, /display: "flex"/);
  assert.doesNotMatch(mdx, /justifyContent/);
  assert.match(mdx, /textAlign: "left"/);
});

test("presentationToMdx emits WebkitTextStroke for an outlined text box", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "REQUEST" }],
            box: { left: 0, top: 8, width: 100, height: 20 },
            style: { color: "#ffffff", textStroke: "5px #000000" },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /WebkitTextStroke: "5px #000000"/);
  assert.match(mdx, /color: "#ffffff"/);
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
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt" }], videos: [{ fileName: "clip.mov" }], tableCount: 2 })]),
  );

  assert.match(mdx, /<Image src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);
  assert.match(mdx, /<video src=\{`\$\{imageRoot\}\/clip\.mov`\}><\/video>/);
  assert.match(mdx, /\{\/\* 2 table\(s\) on this slide could not be extracted \*\/\}/);
});

test("presentationToMdx wraps a masked image in an overflow:hidden clip wrapper with an inner <Image>", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        images: [
          {
            fileName: "pic.png",
            altText: "alt",
            box: { left: 0, top: 0, width: 100, height: 100 },
            crop: { left: 10, top: 20, width: 30, height: 40, imgLeft: -50, imgTop: -25, imgWidth: 200, imgHeight: 150 },
          },
        ],
      }),
    ]),
  );

  assert.match(
    mdx,
    /<div style=\{\{ position: "absolute", left: "10%", top: "20%", width: "30%", height: "40%", overflow: "hidden" \}\}>/,
  );
  assert.match(
    mdx,
    /<Image style=\{\{ position: "absolute", left: "-50%", top: "-25%", width: "200%", height: "150%" \}\} src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/,
  );
  assert.match(mdx, /<\/div>/);
});

test("presentationToMdx renders a maskless image as a plain <Image>, with no clip wrapper", () => {
  const mdx = presentationToMdx(
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt", box: { left: 0, top: 0, width: 50, height: 50 } }] })]),
  );

  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: "0%", width: "50%", top: "0%", height: "50%" \}\} src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);
  assert.doesNotMatch(mdx, /overflow: "hidden"/);
});

test("presentationToMdx emits a translucent image's opacity in its inline style", () => {
  const mdx = presentationToMdx(
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt", box: { left: 0, top: 0, width: 50, height: 50 }, opacity: 0.15 }] })]),
  );

  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: "0%", width: "50%", top: "0%", height: "50%", opacity: 0\.15 \}\} src=/);
});

test("presentationToMdx emits opacity on an unpositioned image, and none when opaque", () => {
  const translucent = presentationToMdx(deck([slide({ images: [{ fileName: "pic.png", altText: "alt", opacity: 0.15 }] })]));
  assert.match(translucent, /<Image style=\{\{ opacity: 0\.15 \}\} src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);

  const opaque = presentationToMdx(deck([slide({ images: [{ fileName: "pic.png", altText: "alt" }] })]));
  assert.doesNotMatch(opaque, /opacity/);
});

test("presentationToMdx puts a cropped image's opacity on the inner <Image>", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        images: [
          {
            fileName: "pic.png",
            altText: "alt",
            box: { left: 0, top: 0, width: 100, height: 100 },
            crop: { left: 10, top: 20, width: 30, height: 40, imgLeft: -50, imgTop: -25, imgWidth: 200, imgHeight: 150 },
            opacity: 0.15,
          },
        ],
      }),
    ]),
  );

  // The opacity rides the inner image, not the clip container.
  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: "-50%", top: "-25%", width: "200%", height: "150%", opacity: 0\.15 \}\} src=/);
  assert.doesNotMatch(mdx, /overflow: "hidden", opacity/);
});

test("presentationToMdx sizes each paragraph of a mixed-size text box, dropping the box-level fontSize", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [
              { depth: 0, text: "83k", fontSizeToken: "var(--text-8xl)" },
              { depth: 0, text: "average requests per second", fontSizeToken: "var(--text-sm)" },
            ],
            box: { left: 10, top: 20, width: 30, height: 40 },
            style: { fontSizeToken: "var(--text-8xl)", color: "#ffffff" },
          },
        ],
      }),
    ]),
  );

  // The box div keeps position/color but no fontSize; each paragraph carries its own.
  assert.match(mdx, /<div style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%", color: "#ffffff" \}\}>/);
  assert.doesNotMatch(mdx, /<div style=[^>]*fontSize/);
  assert.match(mdx, /<p style=\{\{ fontSize: "var\(--text-8xl\)" \}\}>83k<\/p>/);
  assert.match(mdx, /<p style=\{\{ fontSize: "var\(--text-sm\)" \}\}>average requests per second<\/p>/);
});

test("presentationToMdx keeps a single box-level fontSize for a uniform-size text box", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [
              { depth: 0, text: "one", fontSizeToken: "var(--text-lg)" },
              { depth: 0, text: "two", fontSizeToken: "var(--text-lg)" },
            ],
            box: { left: 10, top: 20, width: 30, height: 40 },
            style: { fontSizeToken: "var(--text-lg)" },
          },
        ],
      }),
    ]),
  );

  // One box-level size, prose joined by a blank line, no per-paragraph <p> wrappers.
  assert.match(mdx, /fontSize: "var\(--text-lg\)" \}\}>\n\s*one\n\n\s*two\n\s*<\/div>/);
  assert.doesNotMatch(mdx, /<p style/);
});

test("isImageFile detects image extensions case-insensitively and rejects videos and extensionless names", () => {
  assert.equal(isImageFile("a.gif"), true);
  assert.equal(isImageFile("a.GIF"), true);
  assert.equal(isImageFile("a.mp4"), false);
  assert.equal(isImageFile("a.mov"), false);
  assert.equal(isImageFile("noext"), false);
});

test("presentationToMdx renders an animated-image 'video' as an <Image>, not a <video>", () => {
  const mdx = presentationToMdx(deck([slide({ videos: [{ fileName: "clip.gif" }] })]));
  assert.match(mdx, /<Image src=\{`\$\{imageRoot\}\/clip\.gif`\} role="presentation" alt="" \/>/);
  assert.doesNotMatch(mdx, /<video/);
});

test("presentationToMdx still renders a real movie 'video' as a <video> (no controls)", () => {
  const mdx = presentationToMdx(deck([slide({ videos: [{ fileName: "clip.mp4" }] })]));
  assert.match(mdx, /<video src=\{`\$\{imageRoot\}\/clip\.mp4`\}><\/video>/);
  assert.doesNotMatch(mdx, /controls/);
  assert.doesNotMatch(mdx, /<Image/);
});

test("presentationToMdx renders a full-bleed video as an objectFit:cover backdrop layer", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.mp4", box: { left: 0, top: 0, width: 100, height: 100 } }] })]),
  );
  assert.match(
    mdx,
    /<video style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" \}\} src=\{`\$\{imageRoot\}\/clip\.mp4`\} \/>/,
  );
});

test("presentationToMdx positions a non-full-bleed video via its box (absolute, no objectFit)", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.mp4", box: { left: 10, top: 20, width: 30, height: 40 } }] })]),
  );
  assert.match(
    mdx,
    /<video style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%" \}\} src=\{`\$\{imageRoot\}\/clip\.mp4`\} \/>/,
  );
  assert.doesNotMatch(mdx, /objectFit/);
});

test("presentationToMdx keeps the tint and cover video at the backdrop, with z-ordered content painting after them in document order", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        background: "bg.jpg",
        backgroundTint: "rgba(0, 0, 0, 0.5)",
        videos: [{ fileName: "clip.mp4", box: { left: 0, top: 0, width: 100, height: 100 }, zOrder: 9 }],
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "over" }], box: { left: 5, top: 5, width: 10, height: 10 }, zOrder: 4 },
        ],
      }),
    ]),
  );
  // The tint overlay and full-bleed cover video both sit at the backdrop rank (0)
  // and carry no zIndex; the rank-5 content paints above them via document order.
  const tintIdx = mdx.indexOf('backgroundColor: "rgba(0, 0, 0, 0.5)"');
  const videoIdx = mdx.indexOf('objectFit: "cover"');
  const overIdx = mdx.indexOf(">\n  over");
  assert.ok(tintIdx >= 0 && videoIdx >= 0 && overIdx >= 0);
  // Backdrop (tint, then full-bleed cover video) precedes the higher-ranked text.
  assert.ok(tintIdx < videoIdx, "tint precedes the cover video");
  assert.ok(videoIdx < overIdx, "the cover video precedes the over-text so the text paints on top");
  assert.doesNotMatch(mdx, /zIndex/);
});

test("presentationToMdx renders a full-bleed animated image 'video' as an <Image> cover layer", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.gif", box: { left: 0, top: 0, width: 100, height: 100 } }] })]),
  );
  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" \}\} src=\{`\$\{imageRoot\}\/clip\.gif`\}/);
});

function cell(text: string, colSpan = 1, rowSpan = 1) {
  return { text, colSpan, rowSpan };
}

test("presentationToMdx renders a spanning table as a classless HTML <table> with span attrs, escaped text, and <br/>", () => {
  const mdx = presentationToMdx(
    deck(
      [
        slide({
          tables: [
            {
              rows: [
                [cell("Header", 8), cell("a <b>")],
                [cell("line1\nline2")],
              ],
            },
          ],
        }),
      ],
      [],
      "My Deck",
    ),
  );

  assert.match(mdx, /<table>/);
  assert.doesNotMatch(mdx, /<table className/);
  assert.doesNotMatch(mdx, /kn-table/);
  assert.equal(mdx.includes("<td colSpan={8}>Header</td>"), true);
  assert.equal(mdx.includes("<td>a &lt;b&gt;</td>"), true);
  assert.equal(mdx.includes("<td>line1<br/>line2</td>"), true);
});

test("presentationToMdx renders a rowspan attribute and omits span attrs of 1", () => {
  const mdx = presentationToMdx(deck([slide({ tables: [{ rows: [[cell("merged", 1, 3)]] }] })]));
  assert.equal(mdx.includes("<td rowSpan={3}>merged</td>"), true);
  assert.doesNotMatch(mdx, /colSpan/);
});

test("presentationToMdx forces a spanless table to HTML when any cell has a background, emitting the fill on <td>", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          {
            rows: [
              [{ text: "Opaque", colSpan: 1, rowSpan: 1, backgroundColor: "#223274" }],
              [{ text: "Faded", colSpan: 1, rowSpan: 1, backgroundColor: "#fb8b8a", backgroundOpacity: 0.249 }],
            ],
          },
        ],
      }),
    ]),
  );

  // A background defeats the markdown path even though every cell is 1x1.
  assert.match(mdx, /<table>/);
  assert.doesNotMatch(mdx, /\| --- \|/);
  // Opaque fill → plain hex; translucent fill → rgba() so the text stays opaque.
  assert.equal(mdx.includes(`<td style={{ backgroundColor: "#223274" }}>Opaque</td>`), true);
  assert.equal(mdx.includes(`<td style={{ backgroundColor: "rgba(251, 139, 138, 0.249)" }}>Faded</td>`), true);
});

test("presentationToMdx forces a spanless table to HTML when a cell has text color/alignment, emitting them on <td>", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          {
            rows: [
              [{ text: "Head", colSpan: 1, rowSpan: 1, color: "#ffffff", align: "center" }],
              [{ text: "Body", colSpan: 1, rowSpan: 1, color: "#000000", align: "left" }],
            ],
          },
        ],
      }),
    ]),
  );

  // Text color/alignment defeat the markdown path even though every cell is 1x1.
  assert.match(mdx, /<table>/);
  assert.doesNotMatch(mdx, /\| --- \|/);
  assert.equal(mdx.includes(`<td style={{ color: "#ffffff", textAlign: "center" }}>Head</td>`), true);
  assert.equal(mdx.includes(`<td style={{ color: "#000000", textAlign: "left" }}>Body</td>`), true);
});

test("presentationToMdx emits background, color, and alignment together on a <td> in a stable order", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [{ rows: [[{ text: "X", colSpan: 1, rowSpan: 1, backgroundColor: "#223274", color: "#ffffff", align: "center" }]] }],
      }),
    ]),
  );

  assert.equal(
    mdx.includes(`<td style={{ backgroundColor: "#223274", color: "#ffffff", textAlign: "center" }}>X</td>`),
    true,
  );
});

test("presentationToMdx emits fontWeight 700 for a bold cell, alongside color/alignment", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          { rows: [[{ text: "Acknowledgment number", colSpan: 1, rowSpan: 1, color: "#223274", bold: true, align: "center" }]] },
        ],
      }),
    ]),
  );

  assert.equal(
    mdx.includes(`<td style={{ color: "#223274", fontWeight: 700, textAlign: "center" }}>Acknowledgment number</td>`),
    true,
  );
});

test("presentationToMdx renders a spanless table as a GFM markdown table (header + separator), escaping pipes and newlines", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          {
            rows: [
              [cell("Name"), cell("Value")],
              [cell("a | b"), cell("line1\nline2")],
            ],
          },
        ],
      }),
    ]),
  );

  assert.doesNotMatch(mdx, /<table/);
  assert.match(mdx, /\| Name \| Value \|/);
  assert.match(mdx, /\| --- \| --- \|/);
  assert.match(mdx, /\| a \\\| b \| line1<br>line2 \|/);
});

test("presentationToMdx emits the shared scoped table <style> BEFORE <Slides>, multi-line, styling table/th/td (no kn-table)", () => {
  const mdx = presentationToMdx(deck([slide({ tables: [{ rows: [[cell("Header", 2)]] }] })], [], "Network Monitor"));

  assert.equal((mdx.match(/<style>/g) ?? []).length, 1, "exactly one <style> block");
  // The style block comes before the <Slides> wrapper.
  assert.ok(mdx.indexOf("<style>") < mdx.indexOf("<Slides"), "style precedes <Slides>");
  // Multi-line CSS scoped to the deck slug, styling the bare table/th/td elements.
  assert.match(mdx, /<style>\{`\n/);
  assert.match(mdx, /\.slides\.network-monitor table \{\n {2}border-collapse: collapse;\n\}/);
  assert.match(mdx, /\.slides\.network-monitor th,\n\.slides\.network-monitor td \{\n {2}border: 1px solid currentColor;\n {2}padding: 0\.25em;\n\}/);
  // Rules are separated by a blank line (declarations within a rule are not).
  assert.match(mdx, /\}\n\n\.slides\.network-monitor th,/);
  assert.doesNotMatch(mdx, /kn-table/);
  assert.doesNotMatch(mdx, /<td style=/);
});

test("presentationToMdx emits the table <style> only once even with multiple tables across slides", () => {
  const mdx = presentationToMdx(
    deck([
      slide({ tables: [{ rows: [[cell("a", 2)]] }] }),
      slide({ tables: [{ rows: [[cell("b", 2)]] }, { rows: [[cell("c", 2)]] }] }),
    ]),
  );

  assert.equal((mdx.match(/<style>/g) ?? []).length, 1);
  assert.equal((mdx.match(/<table>/g) ?? []).length, 3);
});

test("presentationToMdx emits no table <style> when there are no tables", () => {
  const mdx = presentationToMdx(deck([slide({ title: "No tables" })]));
  assert.doesNotMatch(mdx, /<style>/);
  assert.doesNotMatch(mdx, /kn-table/);
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

test("presentationToMdx never emits an unplaced-images section (unreferenced images are dropped)", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Only" })], ["lost-1.png", "lost-2.png"]));
  assert.doesNotMatch(mdx, /Unplaced images/);
  assert.doesNotMatch(mdx, /lost-1\.png/);
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

test("presentationToMdx renders a positioned, styled text box as an inline-style div (no <style> block, no kn-box)", () => {
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

  // No generated stylesheet and no positioning class scheme survive.
  assert.doesNotMatch(mdx, /<style>/);
  assert.doesNotMatch(mdx, /kn-box/);
  assert.doesNotMatch(mdx, /className="kn-/);

  assert.match(
    mdx,
    /<div style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%", fontSize: "var\(--text-4xl\)", color: "#ff0000", fontWeight: 700, textAlign: "center" \}\}>\n\s*99\.9%\n\s*<\/div>/,
  );
});

test("presentationToMdx hoists the sole fontFamily to the scoped default and drops it inline", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "Impact" }],
            style: { fontFamily: "Impact" },
          },
        ],
      }),
    ]),
  );

  // The only family becomes the scope default; no inline fontFamily survives.
  assert.match(mdx, /\.slides\.deck \{\n\s*font-family: "Impact";\n\}/);
  assert.doesNotMatch(mdx, /fontFamily/);
  assert.match(mdx, /<div>\n\s*Impact\n\s*<\/div>/);
});

test("presentationToMdx applies a rarer fontFamily via a scoped class while the common one is the default", () => {
  const mono = (text: string) =>
    ({ kind: "text", paragraphs: [{ depth: 0, text }], style: { fontFamily: "Shopify Sans" } }) as const;
  const mdx = presentationToMdx(
    deck([
      slide({ textBoxes: [mono("a"), mono("b"), { kind: "text", paragraphs: [{ depth: 0, text: "code" }], style: { fontFamily: "Fira Code" } }] }),
    ]),
  );

  // Common family is the default; the rare one is a utility class on its element.
  assert.match(mdx, /\.slides\.deck \{\n\s*font-family: "Shopify Sans";\n\}/);
  assert.match(mdx, /\.slides\.deck \.font-fira-code \{\n\s*font-family: "Fira Code";\n\}/);
  assert.match(mdx, /<div className="font-fira-code">\n\s*code\n\s*<\/div>/);
  assert.doesNotMatch(mdx, /fontFamily/);
});

test("hoistStyles makes a 2+-use color a var with a definition and leaves a single-use color literal", () => {
  const collector = new StyleCollector();
  const slide = collector.add([["backgroundColor", "#223274"]]);
  const twice = collector.add([["color", "#223274"]]);
  const once = collector.add([["color", "#abcdef"]]);
  const wrapper = [
    '<Slides className="deck" backgroundRoot={imageRoot}>',
    `<Slide ${slide}>`,
    `  <div ${twice}>a</div>`,
    `  <div ${once}>b</div>`,
    "</Slide>",
    "</Slides>",
  ].join("\n");
  const { wrapper: out, rules } = hoistStyles(wrapper, ".slides.deck", collector);

  assert.match(rules.join("\n"), /--blue1: #223274;/);
  assert.match(out, /backgroundColor: "var\(--blue1\)"/);
  assert.match(out, /color: "var\(--blue1\)"/);
  // The single-use color is untouched and gets no variable.
  assert.match(out, /color: "#abcdef"/);
  assert.doesNotMatch(rules.join("\n"), /#abcdef/);
});

test("hoistStyles hoists an identical 2+-use style set to a class and leaves a unique one inline", () => {
  const collector = new StyleCollector();
  const repeated = [["position", "absolute"], ["overflow", "hidden"], ["zIndex", 1]] as const;
  const a = collector.add([...repeated]);
  const b = collector.add([...repeated]);
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

test("presentationToMdx renders a promoted full-bleed image as a bare-filename background (cover, no contain)", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Bg", background: "x.png", className: "blank" })]));

  // Bare file name: the Slide component already prepends backgroundRoot (= imageRoot).
  assert.match(mdx, /<Slide className="blank" background="x\.png" opaqueBackground>/);
  assert.doesNotMatch(mdx, /background=\{`\$\{imageRoot\}/);
  assert.doesNotMatch(mdx, /backgroundContain/);
});

test("presentationToMdx layers positioned text (rank 2) above positioned images (rank 1) via document order", () => {
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

  assert.doesNotMatch(mdx, /<style>/);
  assert.doesNotMatch(mdx, /zIndex/);
  // The image carries a bare absolute style (no zIndex).
  assert.match(
    mdx,
    /<Image style=\{\{ position: "absolute", left: "10%", width: "50%", top: "10%", height: "50%" \}\} src=\{`\$\{imageRoot\}\/diagram\.png`\}/,
  );
  // Stacking is document order: the rank-1 image precedes the rank-2 text box, so
  // the text paints on top.
  const imageIdx = mdx.indexOf("diagram.png");
  const labelIdx = mdx.indexOf(">\n  label");
  assert.ok(imageIdx >= 0 && labelIdx >= 0);
  assert.ok(imageIdx < labelIdx, "the rank-1 image precedes the rank-2 text box");
});

test("presentationToMdx leaves an unpositioned, unstyled text box in normal flow with no wrapper or <style>", () => {
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
  assert.doesNotMatch(mdx, /kn-box/);
  assert.match(mdx, /^<Slides /);
  assert.match(mdx, /# Title/);
  assert.match(mdx, /- A bullet/);
  assert.match(mdx, /loose caption/);
  // An unpositioned image stays in flow with no style attribute.
  assert.match(mdx, /<Image src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);
});

test("styleAttr quotes string values, leaves numbers bare, and returns '' when empty", () => {
  assert.equal(
    styleAttr([
      ["position", "absolute"],
      ["left", "10%"],
      ["fontWeight", 700],
    ]),
    'style={{ position: "absolute", left: "10%", fontWeight: 700 }}',
  );
  assert.equal(styleAttr([]), "");
});

test("positionRules anchors a bottom-right auto-size box by its near (right/bottom) edges", () => {
  assert.deepEqual(positionRules({ left: 94.4, top: 97.2, width: 0, height: 0 }), [
    ["right", "5.6%"],
    ["bottom", "2.8%"],
  ]);
});

test("positionRules keeps left/top/width/height for a real-sized box", () => {
  assert.deepEqual(positionRules({ left: 10, top: 20, width: 30, height: 40 }), [
    ["left", "10%"],
    ["width", "30%"],
    ["top", "20%"],
    ["height", "40%"],
  ]);
});

test("positionRules anchors a top-left auto-size box by left/top (no width/height)", () => {
  assert.deepEqual(positionRules({ left: 28, top: 12, width: 0, height: 0 }), [
    ["left", "28%"],
    ["top", "12%"],
  ]);
});

test("presentationToMdx centres an unfilled auto-size label on its anchor point and centre-aligns its text", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "Virgo" }], box: { left: 50, top: 45, width: 0, height: 0 } },
        ],
      }),
    ]),
  );

  assert.match(mdx, /left: "50%", top: "45%"/);
  assert.match(mdx, /textAlign: "center"/);
  assert.match(mdx, /transform: "translate\(-50%, -50%\)"/);
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

  assert.match(mdx, /<div style=\{\{ position: "absolute", right: "5\.6%", bottom: "2\.8%" \}\}>/);
  assert.doesNotMatch(mdx, /width: "0%"/);
  assert.doesNotMatch(mdx, /height: "0%"/);
  assert.doesNotMatch(mdx, /left:/);
  assert.doesNotMatch(mdx, /top:/);
});

test("presentationToMdx renders a vector shape as a <use> in an <svg> sized to the slide, defining the path once", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ localD: "M 0 0 L 100 0", transform: "translate(100 200) scale(7.16 0)", stroke: "#000000", strokeWidth: 2 }] })]),
  );

  // The unique local path is defined once in a hidden document-level <defs>.
  assert.match(mdx, /<svg width="0" height="0" aria-hidden="true" style=\{\{ position: "absolute" \}\}>/);
  assert.match(mdx, /<defs>\n\s*<line id="kn-p1" x1="0" y1="0" x2="100" y2="0" \/>\n\s*<\/defs>/);
  // The shape instance references it via <use> in the slide overlay, carrying its transform + style.
  assert.match(mdx, /<svg viewBox="0 0 1920 1080"/);
  assert.match(mdx, /<use href="#kn-p1" transform="translate\(100 200\) scale\(7\.16 0\)" style=\{\{ fill: "none", stroke: "#000000", strokeWidth: 2 \}\} \/>/);
  // The overlay carries no zIndex; its stacking comes from document order.
  assert.doesNotMatch(mdx, /zIndex/);
  assert.match(mdx, /pointerEvents: "none"/);
  assert.doesNotMatch(mdx, /kn-arrow/);
});

test("presentationToMdx groups a run of consecutive shapes into one overlay <svg>, marker in the document defs", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          { localD: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, markerEnd: true },
          { localD: "M 5 5 C 6 6 7 7 8 8", stroke: "#111111", strokeWidth: 3 },
        ],
      }),
    ]),
  );

  // Two contiguous shapes share ONE overlay <svg> (plus the hidden defs <svg>).
  assert.equal(mdx.match(/viewBox="0 0 1920 1080"/g)?.length, 1);
  assert.match(mdx, /<use href="#kn-p1"[^>]*markerEnd="url\(#kn-arrow\)"/);
  assert.match(mdx, /<use href="#kn-p2"/);
  // The arrow marker is defined exactly once, in the shared document defs.
  assert.equal(mdx.match(/<marker /g)?.length, 1);
  assert.ok(mdx.indexOf("<marker ") < mdx.indexOf("<Slides"), "marker lives in the leading document defs");
});

test("presentationToMdx splits a shape run around a label box into two overlays at different z", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          { localD: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, zOrder: 1 },
          { localD: "M 5 5 C 6 6 7 7 8 8", stroke: "#000000", strokeWidth: 2, zOrder: 5 },
        ],
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "verifier" }],
            box: { left: 10, top: 10, width: 20, height: 10 },
            style: { backgroundColor: "#f9db9a" },
            zOrder: 3,
          },
        ],
      }),
    ]),
  );

  // A barrier (the box at rank 3) between the two shapes (ranks 1, 5) splits them
  // into TWO overlays (still grouped per run). Stacking is document order, rank =
  // 1 + zOrder: line(2) < box(4) < icon(6), so the emitted order is
  // line-overlay, then the label box, then the icon-overlay.
  assert.equal(mdx.match(/viewBox="0 0 1920 1080"/g)?.length, 2, "two separate overlays");
  assert.doesNotMatch(mdx, /zIndex/);
  const lineIdx = mdx.indexOf('href="#kn-p1"');
  const boxIdx = mdx.indexOf(">\n  verifier");
  const iconIdx = mdx.indexOf('href="#kn-p2"');
  assert.ok(lineIdx >= 0 && boxIdx >= 0 && iconIdx >= 0);
  assert.ok(lineIdx < boxIdx, "the rank-2 line overlay precedes the rank-4 label box");
  assert.ok(boxIdx < iconIdx, "the rank-4 label box precedes the rank-6 icon overlay");
});

test("presentationToMdx dedupes identical local paths into one def, referenced by <use> with differing transforms", () => {
  const mdx = presentationToMdx(
    deck([
      slide({ shapes: [{ localD: "M 0 0 L 50 0", transform: "translate(10 20)", stroke: "#000000", strokeWidth: 2 }] }),
      slide({ shapes: [{ localD: "M 0 0 L 50 0", transform: "translate(80 90) rotate(45 25 0)", stroke: "#000000", strokeWidth: 2 }] }),
    ]),
  );

  // One <defs> for the whole document, with the shared path defined exactly once.
  assert.equal(mdx.match(/<defs>/g)?.length, 1);
  assert.equal(mdx.match(/<line id="kn-p1"/g)?.length, 1);
  assert.equal(mdx.match(/x1="0" y1="0" x2="50" y2="0"/g)?.length, 1);
  // Both instances reference the same def, each with its own transform.
  assert.equal(mdx.match(/href="#kn-p1"/g)?.length, 2);
  assert.match(mdx, /<use [^>]*href="#kn-p1" transform="translate\(10 20\)"/);
  assert.match(mdx, /<use [^>]*href="#kn-p1" transform="translate\(80 90\) rotate\(45 25 0\)"/);
});

test("presentationToMdx defines an all-L path as a <polyline> and a curved/closed path as a <path>", () => {
  const mdx = presentationToMdx(
    deck([
      slide({ shapes: [{ localD: "M 0 0 L 10 0 L 10 10", stroke: "#000000", strokeWidth: 2 }] }),
      slide({ shapes: [{ localD: "M 0 0 C 1 1 2 2 3 3 Z", fill: "#ff0000" }] }),
    ]),
  );

  assert.match(mdx, /<polyline id="kn-p1" points="0,0 10,0 10,10" \/>/);
  assert.match(mdx, /<path id="kn-p2" d="M 0 0 C 1 1 2 2 3 3 Z" \/>/);
});

test("presentationToMdx orders positioned image and box by drawablesZOrder rank in the document", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        images: [{ fileName: "p.png", altText: "p", box: { left: 0, top: 0, width: 50, height: 50 }, zOrder: 2 }],
        textBoxes: [
          { kind: "text", paragraphs: [{ depth: 0, text: "t" }], box: { left: 1, top: 1, width: 9, height: 9 }, zOrder: 0 },
        ],
      }),
    ]),
  );

  // No zIndex anywhere; stacking is document order. The box (zOrder 0 -> rank 1)
  // precedes the image (zOrder 2 -> rank 3), so the image paints on top — even
  // though the box is emitted from a later category (text boxes after images).
  assert.doesNotMatch(mdx, /zIndex/);
  const boxIdx = mdx.indexOf(">\n  t");
  const imageIdx = mdx.indexOf("p.png");
  assert.ok(boxIdx >= 0 && imageIdx >= 0);
  assert.ok(boxIdx < imageIdx, "the rank-1 box precedes the rank-3 image");
});

test("presentationToMdx uses the deck slideSize for the shape overlay viewBox", () => {
  const mdx = presentationToMdx({
    title: "Deck",
    slides: [slide({ shapes: [{ localD: "M 0 0 L 10 10", stroke: "currentColor", strokeWidth: 2 }] })],
    unplacedImages: [],
    slideSize: { width: 1280, height: 720 },
  });

  assert.match(mdx, /<svg viewBox="0 0 1280 720"/);
});

test("presentationToMdx emits the shared arrow marker and wires markerEnd for arrow shapes", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ localD: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, markerEnd: true }] })]),
  );

  assert.match(mdx, /<marker id="kn-arrow"/);
  assert.match(mdx, /<use [^>]*markerEnd="url\(#kn-arrow\)"/);
});

test("presentationToMdx sizes the arrow marker in user space so thick strokes don't bloat the head", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ localD: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 8, markerEnd: true }] })]),
  );
  assert.match(mdx, /markerUnits="userSpaceOnUse"/);
  assert.match(mdx, /markerWidth="20" markerHeight="20"/);
});

test("presentationToMdx omits the shape overlay (and defs) when a slide has no shapes", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Plain" })]));
  assert.doesNotMatch(mdx, /<svg/);
});

test("presentationToMdx emits dash, linecap, and opacity attrs on a shape <use> when present", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          {
            localD: "M 0 0 L 100 0",
            stroke: "#213373",
            strokeWidth: 5,
            strokeDasharray: "0.005,10",
            strokeLinecap: "round",
            strokeOpacity: 0.5,
            fill: "#00ff00",
            fillOpacity: 0.25,
          },
        ],
      }),
    ]),
  );

  assert.match(mdx, /<use [^>]*strokeDasharray: "0.005,10"/);
  assert.match(mdx, /strokeLinecap: "round"/);
  assert.match(mdx, /strokeOpacity: 0.5/);
  assert.match(mdx, /fillOpacity: 0.25/);
});

test("presentationToMdx emits the slide background color as an inline style on <Slide>", () => {
  const mdx = presentationToMdx(deck([slide({ backgroundColor: "#213373", title: "Hi" })]));
  assert.match(mdx, /<Slide style=\{\{ backgroundColor: "#213373" \}\}>/);
});

test("presentationToMdx renders a slide carrying only a background color", () => {
  const mdx = presentationToMdx(deck([slide({ backgroundColor: "#213373" })]));
  assert.match(mdx, /<Slide style=\{\{ backgroundColor: "#213373" \}\} \/>/);
});

test("presentationToMdx emits a full-bleed tint overlay div (backdrop rank, no zIndex) when a slide has a backgroundTint", () => {
  const mdx = presentationToMdx(
    deck([slide({ background: "universe.jpg", backgroundTint: "rgba(33, 51, 115, 0.756)", title: "Hi" })]),
  );
  assert.match(
    mdx,
    /<div style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor: "rgba\(33, 51, 115, 0\.756\)" \}\} \/>/,
  );
});

test("presentationToMdx omits the tint overlay div when a slide has no backgroundTint", () => {
  const mdx = presentationToMdx(deck([slide({ background: "universe.jpg", title: "Hi" })]));
  // No full-bleed backdrop tint div is emitted.
  assert.doesNotMatch(mdx, /position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor/);
});

test("assembleMdxDocument puts a blank line between the exports and the body, and ends with a newline", () => {
  const doc = assembleMdxDocument("export const title = 'Deck';", "<Slides>\n<Slide />\n</Slides>");

  assert.equal(doc, "export const title = 'Deck';\n\n<Slides>\n<Slide />\n</Slides>\n");
  assert.match(doc, /;\n\n<Slides>/);
});

test("presentationToMdx emits opacity on a shape <use> with a translucent shapeProperties.opacity, none when opaque", () => {
  const translucent = presentationToMdx(
    deck([slide({ shapes: [{ localD: "M 0 0 L 10 0", stroke: "none", strokeWidth: 2, fill: "#ffffff", opacity: 0.7 }] })]),
  );
  assert.match(translucent, /<use href="#kn-p1"[^>]*opacity: 0\.7/);

  const opaque = presentationToMdx(
    deck([slide({ shapes: [{ localD: "M 0 0 L 10 0", stroke: "none", strokeWidth: 2, fill: "#ffffff" }] })]),
  );
  assert.doesNotMatch(opaque, /opacity:/);
});

test("presentationToMdx places a backdrop master image first (rank 0), a normal one after it, in document order", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        images: [
          { fileName: "percy.jpg", altText: "", box: { left: 0, top: 0, width: 100, height: 100 }, backdrop: true },
          { fileName: "logo.png", altText: "", box: { left: 80, top: 80, width: 10, height: 10 } },
        ],
      }),
    ]),
  );
  assert.doesNotMatch(mdx, /zIndex/);
  // The backdrop image (rank 0) precedes the rank-1 logo, so the logo paints on top.
  const percyIdx = mdx.indexOf("percy.jpg");
  const logoIdx = mdx.indexOf("logo.png");
  assert.ok(percyIdx >= 0 && logoIdx >= 0);
  assert.ok(percyIdx < logoIdx, "the rank-0 backdrop precedes the rank-1 logo");
});

test("presentationToMdx emits textShadow and opacity declarations for a positioned text box", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        textBoxes: [
          {
            kind: "text",
            paragraphs: [{ depth: 0, text: "Thanks\!" }],
            box: { left: 10, top: 20, width: 30, height: 40 },
            style: { color: "#ffffff", textShadow: "0px -2px 16px #000000", opacity: 0.7 },
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /textShadow: "0px -2px 16px #000000"/);
  assert.match(mdx, /opacity: 0\.7/);
});

test("presentationToMdx hoists a cell fontFamily to the scoped default, dropping it from the td style", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        tables: [
          {
            rows: [[{ text: "Octet", colSpan: 1, rowSpan: 1, color: "#000000", fontFamily: "Shopify Sans", align: "center" }]],
          },
        ],
      }),
    ]),
  );
  assert.match(mdx, /\.slides\.deck \{\n\s*font-family: "Shopify Sans";\n\}/);
  assert.match(mdx, /<td style=\{\{ color: "#000000", textAlign: "center" \}\}>Octet<\/td>/);
  assert.doesNotMatch(mdx, /fontFamily/);
});
