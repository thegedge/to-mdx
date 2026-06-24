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

// Languages identified by a single distinctive marker. eBPF is C with BPF macros
// and helpers (`BPF_HASH`, `kprobe__…`, `bpf_*()`); linguist has no eBPF grammar,
// so it's labelled `c`.
const STRONG_PATTERNS: Record<string, RegExp> = {
  c: /\bBPF_HASH\b|\bkprobe__|\bbpf_[a-z_]+\(/,
};

export class LanguageDetector {
  static detect(content: string): string | null {
    const scored = bestScoredLanguage(content);
    if (scored) {
      return scored;
    }

    for (const [language, pattern] of Object.entries(STRONG_PATTERNS)) {
      if (pattern.test(content)) {
        return language;
      }
    }
    return null;
  }
}

/** The highest-scoring multi-pattern language, or null if none reaches the threshold. */
function bestScoredLanguage(content: string): string | null {
  let bestLanguage: string | null = null;
  let bestScore = 0;

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    const score = patterns.reduce((sum, pattern) => (pattern.test(content) ? sum + 1 : sum), 0);
    if (score >= MIN_SCORE && score > bestScore) {
      bestLanguage = language;
      bestScore = score;
    }
  }

  return bestLanguage;
}
