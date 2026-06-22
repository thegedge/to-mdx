import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeDebugDump, writeRawDump } from "./debug.ts";
import type { Presentation } from "./model.ts";
import { buildRegistry, mockObject, ref } from "./test_support.ts";
import { KeynoteType } from "./types.ts";

const T = KeynoteType;

async function withTempFile(run: (filePath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "keynote-debug-"));
  try {
    await run(path.join(dir, "dump.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const emptyPresentation: Presentation = { title: "T", slides: [], unplacedImages: [] };

test("writeDebugDump emits compact single-line JSON", async () => {
  await withTempFile(async (filePath) => {
    const registry = buildRegistry([mockObject(1n, T.slideArchive, {})]);
    await writeDebugDump(filePath, registry, emptyPresentation, []);

    const output = await readFile(filePath, "utf8");
    assert.ok(!output.includes("\n"), "expected no newlines (compact)");
    assert.ok(!output.includes("  "), "expected no indentation (compact)");
    JSON.parse(output);
  });
});

test("writeRawDump emits compact single-line JSON", async () => {
  await withTempFile(async (filePath) => {
    const registry = buildRegistry([mockObject(1n, T.slideArchive, {})]);
    await writeRawDump(filePath, registry);

    const output = await readFile(filePath, "utf8");
    assert.ok(!output.includes("\n"), "expected no newlines");
    JSON.parse(output);
  });
});

test("writeRawDump samples slides in presentation order, not registry order", async () => {
  // Registry (insertion) order of SlideArchives: 10, 20, 30, 40.
  // Slide-tree (presentation) order: 40, 30, 20 — deliberately reversed and
  // excluding 10, so the two orderings disagree on the first three slides.
  await withTempFile(async (filePath) => {
    const registry = buildRegistry([
      mockObject(1n, T.documentArchive, { show: ref(2n) }),
      mockObject(2n, T.showArchive, { slideTree: { slides: [ref(40n), ref(30n), ref(20n)] } }),
      mockObject(10n, T.slideArchive, {}),
      mockObject(20n, T.slideArchive, {}),
      mockObject(30n, T.slideArchive, {}),
      mockObject(40n, T.slideArchive, {}),
    ]);

    await writeRawDump(filePath, registry);

    const dumped = JSON.parse(await readFile(filePath, "utf8")) as Array<{ id: string }>;
    const ids = new Set(dumped.map((object) => object.id));

    assert.ok(ids.has("40"), "presentation-order slide 40 should be dumped");
    assert.ok(ids.has("30"));
    assert.ok(ids.has("20"));
    assert.ok(!ids.has("10"), "registry-order-only slide 10 should NOT be dumped");
  });
});
