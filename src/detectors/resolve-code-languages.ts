interface ResolveDeps {
  regexDetect: (content: string) => string | null;
  llmDetect: (content: string) => Promise<string | null>;
}

export async function resolveCodeLanguages(
  contents: string[],
  { regexDetect, llmDetect }: ResolveDeps,
): Promise<Map<string, string | null>> {
  const cache = new Map<string, string | null>();
  const unique = [...new Set(contents)];

  const pending: Promise<void>[] = [];
  for (const content of unique) {
    const regexLanguage = regexDetect(content);
    if (regexLanguage) {
      cache.set(content, regexLanguage);
      continue;
    }

    pending.push(
      llmDetect(content).then((language) => {
        cache.set(content, language);
      }),
    );
  }

  await Promise.all(pending);
  return cache;
}
