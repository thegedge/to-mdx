import assert from "node:assert/strict";
import { test } from "node:test";
import { LanguageDetector } from "./language-detector.ts";

test("detect scores Ruby from its keywords/symbols", () => {
  const ruby = "class Foo\n  def bar\n    render :baz\n  end\nend";
  assert.equal(LanguageDetector.detect(ruby), "ruby");
});

test("detect labels eBPF source (BPF macros, kprobe entrypoints, bpf_* helpers) as c", () => {
  assert.equal(LanguageDetector.detect("BPF_HASH(start, u32);"), "c");
  assert.equal(LanguageDetector.detect("int kprobe__tcp_v4_connect(struct pt_regs *ctx) {"), "c");
  assert.equal(LanguageDetector.detect("u64 ts = bpf_ktime_get_ns();"), "c");
});

test("detect returns null for ordinary prose", () => {
  assert.equal(LanguageDetector.detect("The quick brown fox jumps over the lazy dog."), null);
  assert.equal(LanguageDetector.detect("We measured BPF performance across the fleet."), null);
});
