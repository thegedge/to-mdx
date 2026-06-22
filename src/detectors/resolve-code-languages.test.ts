import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { resolveCodeLanguages } from "./resolve-code-languages.ts";

test("regex hit skips the LLM", async () => {
  const regexDetect = mock.fn(() => "ruby");
  const llmDetect = mock.fn(async () => "python");

  const cache = await resolveCodeLanguages(["def foo; end"], { regexDetect, llmDetect });

  assert.equal(cache.get("def foo; end"), "ruby");
  assert.equal(llmDetect.mock.callCount(), 0);
});

test("regex null falls back to the LLM", async () => {
  const regexDetect = mock.fn(() => null);
  const llmDetect = mock.fn(async () => "python");

  const cache = await resolveCodeLanguages(["print('hi')"], { regexDetect, llmDetect });

  assert.equal(cache.get("print('hi')"), "python");
  assert.equal(llmDetect.mock.callCount(), 1);
});

test("duplicate contents call the LLM once", async () => {
  const regexDetect = mock.fn(() => null);
  const llmDetect = mock.fn(async () => "python");

  const cache = await resolveCodeLanguages(["print('hi')", "print('hi')"], { regexDetect, llmDetect });

  assert.equal(cache.get("print('hi')"), "python");
  assert.equal(llmDetect.mock.callCount(), 1);
});
