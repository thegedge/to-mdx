import assert from "node:assert/strict";
import { test } from "node:test";
import type { Presentation, Slide } from "./model.ts";
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
  assert.match(mdx, /<video controls src=\{`\$\{imageRoot\}\/clip\.mov`\}><\/video>/);
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
    /<div style=\{\{ position: "absolute", left: "10%", top: "20%", width: "30%", height: "40%", overflow: "hidden", zIndex: 1 \}\}>/,
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

  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: "0%", width: "50%", top: "0%", height: "50%", zIndex: 1 \}\} src=\{`\$\{imageRoot\}\/pic\.png`\} role="presentation" alt="alt" \/>/);
  assert.doesNotMatch(mdx, /overflow: "hidden"/);
});

test("presentationToMdx emits a translucent image's opacity in its inline style", () => {
  const mdx = presentationToMdx(
    deck([slide({ images: [{ fileName: "pic.png", altText: "alt", box: { left: 0, top: 0, width: 50, height: 50 }, opacity: 0.15 }] })]),
  );

  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: "0%", width: "50%", top: "0%", height: "50%", zIndex: 1, opacity: 0\.15 \}\} src=/);
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
  assert.doesNotMatch(mdx, /overflow: "hidden", zIndex: 1, opacity/);
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
  assert.match(mdx, /<div style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%", zIndex: 2, color: "#ffffff" \}\}>/);
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
  assert.match(mdx, /zIndex: 2, fontSize: "var\(--text-lg\)" \}\}>\n\s*one\n\n\s*two\n\s*<\/div>/);
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

test("presentationToMdx still renders a real movie 'video' as a <video controls>", () => {
  const mdx = presentationToMdx(deck([slide({ videos: [{ fileName: "clip.mp4" }] })]));
  assert.match(mdx, /<video controls src=\{`\$\{imageRoot\}\/clip\.mp4`\}><\/video>/);
  assert.doesNotMatch(mdx, /<Image/);
});

test("presentationToMdx renders a full-bleed video as an objectFit:cover layer at zIndex 0", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.mp4", box: { left: 0, top: 0, width: 100, height: 100 } }] })]),
  );
  assert.match(
    mdx,
    /<video controls style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 \}\} src=\{`\$\{imageRoot\}\/clip\.mp4`\} \/>/,
  );
});

test("presentationToMdx positions a non-full-bleed video via its box (absolute, zIndex 1)", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.mp4", box: { left: 10, top: 20, width: 30, height: 40 } }] })]),
  );
  assert.match(
    mdx,
    /<video controls style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%", zIndex: 1 \}\} src=\{`\$\{imageRoot\}\/clip\.mp4`\} \/>/,
  );
  assert.doesNotMatch(mdx, /objectFit/);
});

test("presentationToMdx keeps the cover background, tint, and cover video at zIndex 0 beneath z-ordered content", () => {
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
  // Tint overlay stays at the backdrop layer.
  assert.match(mdx, /<div style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor: "rgba\(0, 0, 0, 0\.5\)", zIndex: 0 \}\} \/>/);
  // A full-bleed cover video stays at zIndex 0 even though it carries a zOrder.
  assert.match(mdx, /<video controls style=\{\{[^}]*objectFit: "cover", zIndex: 0 \}\}/);
  // Content above the backdrop derives its zIndex from its rank (4 -> 5).
  assert.match(mdx, /<div style=\{\{ position: "absolute"[^}]*zIndex: 5 \}\}>\n\s*over/);
});

test("presentationToMdx renders a full-bleed animated image 'video' as an <Image> cover layer", () => {
  const mdx = presentationToMdx(
    deck([slide({ videos: [{ fileName: "clip.gif", box: { left: 0, top: 0, width: 100, height: 100 } }] })]),
  );
  assert.match(mdx, /<Image style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 \}\} src=\{`\$\{imageRoot\}\/clip\.gif`\}/);
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
    /<div style=\{\{ position: "absolute", left: "10%", width: "30%", top: "20%", height: "40%", zIndex: 2, fontSize: "var\(--text-4xl\)", color: "#ff0000", fontWeight: 700, textAlign: "center" \}\}>\n\s*99\.9%\n\s*<\/div>/,
  );
});

test("presentationToMdx emits fontFamily in a text box's inline style when present", () => {
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

  assert.match(mdx, /<div style=\{\{ fontFamily: "Impact" \}\}>\n\s*Impact\n\s*<\/div>/);
});

test("presentationToMdx renders a promoted full-bleed image as a bare-filename background (cover, no contain)", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Bg", background: "x.png", className: "blank" })]));

  // Bare file name: the Slide component already prepends backgroundRoot (= imageRoot).
  assert.match(mdx, /<Slide className="blank" background="x\.png" opaqueBackground>/);
  assert.doesNotMatch(mdx, /background=\{`\$\{imageRoot\}/);
  assert.doesNotMatch(mdx, /backgroundContain/);
});

test("presentationToMdx layers positioned text (zIndex 2) above positioned images (zIndex 1) via inline style", () => {
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
  // The image carries an inline absolute style (zIndex 1) and comes before src.
  assert.match(
    mdx,
    /<Image style=\{\{ position: "absolute", left: "10%", width: "50%", top: "10%", height: "50%", zIndex: 1 \}\} src=\{`\$\{imageRoot\}\/diagram\.png`\}/,
  );
  // The text box is layered above it (zIndex 2).
  assert.match(mdx, /<div style=\{\{ position: "absolute"[^}]*zIndex: 2 \}\}>/);
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

  assert.match(mdx, /<div style=\{\{ position: "absolute", right: "5\.6%", bottom: "2\.8%", zIndex: 2 \}\}>/);
  assert.doesNotMatch(mdx, /width: "0%"/);
  assert.doesNotMatch(mdx, /height: "0%"/);
  assert.doesNotMatch(mdx, /left:/);
  assert.doesNotMatch(mdx, /top:/);
});

test("presentationToMdx renders a vector shape as its own <svg> sized to the slide", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ d: "M 100 200 L 816 200", stroke: "#000000", strokeWidth: 2 }] })]),
  );

  assert.match(mdx, /<svg viewBox="0 0 1920 1080"/);
  assert.match(mdx, /<path d="M 100 200 L 816 200" fill="none" stroke="#000000" strokeWidth=\{2\} \/>/);
  // An unranked shape falls back to the prior fixed z-index 1.
  assert.match(mdx, /zIndex: 1/);
  assert.match(mdx, /pointerEvents: "none"/);
  assert.doesNotMatch(mdx, /kn-arrow/);
});

test("presentationToMdx renders each shape as its own <svg> (not one shared overlay), arrows keep the marker", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          { d: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, markerEnd: true },
          { d: "M 5 5 C 6 6 7 7 8 8", stroke: "#111111", strokeWidth: 3 },
        ],
      }),
    ]),
  );

  // Two separate <svg> elements, one per shape (no single multi-path overlay).
  assert.equal(mdx.match(/<svg /g)?.length, 2);
  assert.match(mdx, /<path d="M 0 0 L 100 0"[^>]*markerEnd="url\(#kn-arrow\)"/);
  assert.match(mdx, /<path d="M 5 5 C 6 6 7 7 8 8"/);
  // The arrow shape's own svg carries the marker defs once (id + markerEnd ref); the plain one has none.
  assert.equal(mdx.match(/kn-arrow/g)?.length, 2);
  assert.equal(mdx.match(/<marker /g)?.length, 1);
});

test("presentationToMdx stacks a later-z shape above a label box and an earlier-z shape below it", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          { d: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, zOrder: 1 },
          { d: "M 5 5 C 6 6 7 7 8 8", stroke: "#000000", strokeWidth: 2, zOrder: 5 },
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

  // zIndex = 1 + zOrder: line(2) < box(4) < icon(6).
  assert.match(mdx, /<svg[^>]*overflow: "visible", zIndex: 2,[^>]*>\n\s*<path d="M 0 0 L 100 0"/);
  assert.match(mdx, /<svg[^>]*overflow: "visible", zIndex: 6,[^>]*>\n\s*<path d="M 5 5 C/);
  assert.match(mdx, /<div style=\{\{ position: "absolute"[^}]*zIndex: 4[^}]*\}\}>\n\s*verifier/);
});

test("presentationToMdx derives positioned image and box zIndex from drawablesZOrder rank", () => {
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

  // Image (zOrder 2 -> zIndex 3) renders above the box (zOrder 0 -> zIndex 1).
  assert.match(mdx, /<Image style=\{\{ position: "absolute"[^}]*zIndex: 3 \}\} src=\{`\$\{imageRoot\}\/p\.png`\}/);
  assert.match(mdx, /<div style=\{\{ position: "absolute"[^}]*zIndex: 1 \}\}>/);
});

test("presentationToMdx uses the deck slideSize for the shape viewBox", () => {
  const mdx = presentationToMdx({
    title: "Deck",
    slides: [slide({ shapes: [{ d: "M 0 0 L 10 10", stroke: "currentColor", strokeWidth: 2 }] })],
    unplacedImages: [],
    slideSize: { width: 1280, height: 720 },
  });

  assert.match(mdx, /<svg viewBox="0 0 1280 720"/);
});

test("presentationToMdx emits the shared arrow marker and wires markerEnd for arrow shapes", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ d: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 2, markerEnd: true }] })]),
  );

  assert.match(mdx, /<marker id="kn-arrow"/);
  assert.match(mdx, /markerEnd="url\(#kn-arrow\)"/);
});

test("presentationToMdx sizes the arrow marker in user space so thick strokes don't bloat the head", () => {
  const mdx = presentationToMdx(
    deck([slide({ shapes: [{ d: "M 0 0 L 100 0", stroke: "#000000", strokeWidth: 8, markerEnd: true }] })]),
  );
  assert.match(mdx, /markerUnits="userSpaceOnUse"/);
  assert.match(mdx, /markerWidth="12" markerHeight="12"/);
  assert.doesNotMatch(mdx, /markerWidth="6"/);
});

test("presentationToMdx omits the shape overlay when a slide has no shapes", () => {
  const mdx = presentationToMdx(deck([slide({ title: "Plain" })]));
  assert.doesNotMatch(mdx, /<svg/);
});

test("presentationToMdx emits dash, linecap, and opacity attrs on a shape path when present", () => {
  const mdx = presentationToMdx(
    deck([
      slide({
        shapes: [
          {
            d: "M 0 0 L 100 0",
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

  assert.match(mdx, /strokeDasharray="0.005,10"/);
  assert.match(mdx, /strokeLinecap="round"/);
  assert.match(mdx, /strokeOpacity=\{0.5\}/);
  assert.match(mdx, /fillOpacity=\{0.25\}/);
});

test("presentationToMdx emits the slide background color as an inline style on <Slide>", () => {
  const mdx = presentationToMdx(deck([slide({ backgroundColor: "#213373", title: "Hi" })]));
  assert.match(mdx, /<Slide style=\{\{ backgroundColor: "#213373" \}\}>/);
});

test("presentationToMdx renders a slide carrying only a background color", () => {
  const mdx = presentationToMdx(deck([slide({ backgroundColor: "#213373" })]));
  assert.match(mdx, /<Slide style=\{\{ backgroundColor: "#213373" \}\} \/>/);
});

test("presentationToMdx emits a zIndex-0 full-bleed tint overlay div when a slide has a backgroundTint", () => {
  const mdx = presentationToMdx(
    deck([slide({ background: "universe.jpg", backgroundTint: "rgba(33, 51, 115, 0.756)", title: "Hi" })]),
  );
  assert.match(
    mdx,
    /<div style=\{\{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor: "rgba\(33, 51, 115, 0\.756\)", zIndex: 0 \}\} \/>/,
  );
});

test("presentationToMdx omits the tint overlay div when a slide has no backgroundTint", () => {
  const mdx = presentationToMdx(deck([slide({ background: "universe.jpg", title: "Hi" })]));
  assert.doesNotMatch(mdx, /zIndex: 0/);
});

test("assembleMdxDocument puts a blank line between the exports and the body, and ends with a newline", () => {
  const doc = assembleMdxDocument("export const title = 'Deck';", "<Slides>\n<Slide />\n</Slides>");

  assert.equal(doc, "export const title = 'Deck';\n\n<Slides>\n<Slide />\n</Slides>\n");
  assert.match(doc, /;\n\n<Slides>/);
});
