import assert from "node:assert/strict";
import { test } from "node:test";
import type { Paragraph } from "../model.ts";
import { asTextBox, isEbpfCode } from "./code.ts";

test("isEbpfCode matches BPF map macros, kprobe entrypoints, and bpf_* helper calls", () => {
  assert.equal(isEbpfCode("BPF_HASH(start, u32);"), true);
  assert.equal(isEbpfCode("int kprobe__tcp_v4_connect(struct pt_regs *ctx) {"), true);
  assert.equal(isEbpfCode("u64 ts = bpf_ktime_get_ns();"), true);
});

test("isEbpfCode does not flag ordinary prose", () => {
  assert.equal(isEbpfCode("The quick brown fox jumps over the lazy dog."), false);
  assert.equal(isEbpfCode("We measured BPF performance across the fleet."), false);
});

test("asTextBox fences eBPF source as c", () => {
  const paragraphs: Paragraph[] = [
    { depth: 0, text: "BPF_HASH(start, u32, u64);" },
    { depth: 0, text: "u64 ts = bpf_ktime_get_ns();" },
  ];
  const box = asTextBox(paragraphs);
  assert.equal(box.kind, "code");
  if (box.kind === "code") assert.equal(box.language, "c");
});

test("asTextBox preserves leading whitespace (from raw) inside the fence", () => {
  const paragraphs: Paragraph[] = [
    { depth: 0, text: "int kprobe__tcp_v4_connect(struct sock *sk) {" },
    { depth: 0, text: "u64 ts = bpf_ktime_get_ns();", raw: "  u64 ts = bpf_ktime_get_ns();" },
    { depth: 0, text: "}" },
  ];
  const box = asTextBox(paragraphs);
  assert.equal(box.kind, "code");
  if (box.kind === "code") {
    assert.equal(box.text, "int kprobe__tcp_v4_connect(struct sock *sk) {\n  u64 ts = bpf_ktime_get_ns();\n}");
  }
});

test("asTextBox leaves prose as a text box", () => {
  const paragraphs: Paragraph[] = [{ depth: 0, text: "A short sentence of prose." }];
  assert.equal(asTextBox(paragraphs).kind, "text");
});
