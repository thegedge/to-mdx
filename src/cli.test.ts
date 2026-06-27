import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProjectRoot } from "./cli.ts";

test("resolveProjectRoot returns the git top-level when git succeeds", () => {
  const root = resolveProjectRoot(() => "/some/repo/root\n");
  assert.equal(root, "/some/repo/root");
});

test("resolveProjectRoot falls back to cwd when git throws", () => {
  const root = resolveProjectRoot(() => {
    throw new Error("fatal: not a git repository");
  });
  assert.equal(root, process.cwd());
});

test("resolveProjectRoot falls back to cwd when git output is empty", () => {
  const root = resolveProjectRoot(() => "   \n");
  assert.equal(root, process.cwd());
});
