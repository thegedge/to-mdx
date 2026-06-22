import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { LlmLanguageDetector } from "./llm-language-detector.ts";

function fakeResponse({ ok = true, status = 200, content = "" } = {}): Response {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

test("valid LLM answer is lowercased and returned", async () => {
  const fetchFn = mock.fn(async () => fakeResponse({ content: "Ruby" }));
  const validateLanguage = mock.fn(() => true);
  const detector = new LlmLanguageDetector({ fetchFn, validateLanguage });

  const result = await detector.detect("def foo; end");

  assert.equal(result, "ruby");
  assert.equal(validateLanguage.mock.calls[0].arguments[0], "ruby");
});

test("invalid answer returns null", async () => {
  const fetchFn = mock.fn(async () => fakeResponse({ content: "Klingon" }));
  const validateLanguage = mock.fn(() => false);
  const detector = new LlmLanguageDetector({ fetchFn, validateLanguage });

  assert.equal(await detector.detect("nuqneH"), null);
});

test("fetch throwing returns null without throwing", async () => {
  const fetchFn = mock.fn(async () => {
    throw new Error("connection refused");
  });
  const detector = new LlmLanguageDetector({ fetchFn, validateLanguage: () => true });

  assert.equal(await detector.detect("x = 1"), null);
});

test("non-OK response returns null", async () => {
  const fetchFn = mock.fn(async () => fakeResponse({ ok: false, status: 500 }));
  const detector = new LlmLanguageDetector({ fetchFn, validateLanguage: () => true });

  assert.equal(await detector.detect("x = 1"), null);
});
