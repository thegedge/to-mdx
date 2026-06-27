const MIN_SCORE = 2;

/**
 * A language signal. A bare regex contributes 1 to the score when it matches; a
 * `[regex, weight]` tuple contributes `weight` — so a single distinctive marker can
 * be worth `MIN_SCORE` and identify a language on its own (no separate "strong"
 * tier needed). Every matching signal adds to the score, and the highest-scoring
 * language at or above `MIN_SCORE` wins.
 */
type Signal = RegExp | readonly [pattern: RegExp, weight: number];

const LANGUAGE_PATTERNS: Record<string, readonly Signal[]> = {
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
  // eBPF is C with BPF macros and helpers (`BPF_HASH`, `kprobe__…`, `bpf_*()`);
  // linguist has no eBPF grammar, so it's labelled `c`. A single BPF marker is
  // distinctive enough to identify it on its own, so it carries the full threshold.
  c: [[/\bBPF_HASH\b|\bkprobe__|\bbpf_[a-z_]+\(/, MIN_SCORE]],
};

export class LanguageDetector {
  /** The highest-scoring language at or above `MIN_SCORE`, or null if none reaches it. */
  static detect(content: string): string | null {
    let bestLanguage: string | null = null;
    let bestScore = 0;

    for (const [language, signals] of Object.entries(LANGUAGE_PATTERNS)) {
      const score = signals.reduce((sum, signal) => {
        const [pattern, weight] = signal instanceof RegExp ? [signal, 1] : signal;
        return pattern.test(content) ? sum + weight : sum;
      }, 0);
      if (score >= MIN_SCORE && score > bestScore) {
        bestLanguage = language;
        bestScore = score;
      }
    }

    return bestLanguage;
  }
}
