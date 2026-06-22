import { all, createStarryNight } from "@wooorm/starry-night";

type FetchFn = typeof fetch;
type ValidateLanguage = (name: string) => boolean;

interface LlmLanguageDetectorOptions {
  endpoint?: string;
  fetchFn?: FetchFn;
  validateLanguage?: ValidateLanguage;
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:8080/v1/chat/completions";
const SYSTEM_PROMPT =
  "/no_think Identify the programming language of the snippet. Reply with ONLY the language name, nothing else.";

let starryNightPromise: Promise<{ flagToScope: (flag: string) => string | undefined }> | null = null;

async function defaultValidateLanguage(name: string): Promise<boolean> {
  starryNightPromise ??= createStarryNight(all);
  const starryNight = await starryNightPromise;
  return starryNight.flagToScope(name) !== undefined;
}

export class LlmLanguageDetector {
  private endpoint: string;
  private fetchFn: FetchFn;
  private validateLanguage: ValidateLanguage | ((name: string) => Promise<boolean>);

  constructor(options: LlmLanguageDetectorOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchFn = options.fetchFn ?? fetch;
    this.validateLanguage = options.validateLanguage ?? defaultValidateLanguage;
  }

  async detect(code: string): Promise<string | null> {
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "smollm3",
          temperature: 0,
          max_tokens: 16,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: code },
          ],
        }),
      });
    } catch (error) {
      console.warn(`LLM language detection request failed: ${String(error)}`);
      return null;
    }

    if (!response.ok) {
      console.warn(`LLM language detection returned status ${response.status}`);
      return null;
    }

    let answer: string;
    try {
      const data = await response.json();
      answer = data.choices[0].message.content.trim().toLowerCase();
    } catch (error) {
      console.warn(`LLM language detection response parsing failed: ${String(error)}`);
      return null;
    }

    return (await this.validateLanguage(answer)) ? answer : null;
  }
}
