const MIN_SCORE = 2;

const LANGUAGE_PATTERNS = {
  ruby: [
    /\b(def|class|module)\s+\w+/m,
    /\b(render|attr_reader|attr_writer|attr_accessor)\s+:\w+/m,
    /\b(elsif|unless|ensure|rescue|yield|rescue_from)\b/m,
    /\b(Rails)\./m,
    /\.(new|fetch)\b/m,
    /^\s*end\s*$/m,
    /[^w]:\w+/m, // symbols
    /\b\w+\([^)]+\w+:/m, // keyword arguments
  ],
};

export class LanguageDetector {
  static detect(content: string): string | null {
    let bestLanguage: string | null = null;
    let bestScore = 0;

    for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      const score = patterns.reduce((sum, pattern) => {
        const matches = pattern.test(content);
        return matches ? sum + 1 : sum;
      }, 0);

      if (score >= MIN_SCORE && score > bestScore) {
        bestLanguage = language;
        bestScore = score;
      }
    }

    return bestLanguage;
  }
}
