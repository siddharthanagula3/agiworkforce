/**
 * Language QA runtime hook — debug-only.
 *
 * Enabled via Settings → Performance → "Run Hindi QA test".
 * Logs model outputs against the 60-prompt Hindi QA suite so the founder
 * can dogfood quality on a real device. Stripped from production builds by
 * the __DEV__ guard; no-op in release.
 *
 * v1.1: add Marathi / Bengali / Tamil suites.
 */

export type QACategory =
  | 'chat'
  | 'translation'
  | 'summarization'
  | 'hinglish'
  | 'cultural'
  | 'technical';

export interface QAPrompt {
  id: string;
  category: QACategory;
  prompt: string;
  expectedCriteria: string;
  /** BLEU/chrF reference translation — only set for translation/summarization */
  referenceOutput?: string;
  /** Whether scoring requires human evaluation (non-metric categories) */
  humanEvalRequired: boolean;
}

export interface QAResult {
  promptId: string;
  modelOutput: string;
  /** Populated when referenceOutput is set and metric can be computed */
  bleuScore?: number;
  chrFScore?: number;
  /** Founder fills this in during dogfood session */
  humanScore?: 0 | 1 | 2 | 3;
  timestampMs: number;
}

export interface QASession {
  sessionId: string;
  modelId: string;
  startedAtMs: number;
  completedAtMs?: number;
  results: QAResult[];
}

// ── In-memory session storage (debug only) ───────────────────────────────────

let activeSession: QASession | null = null;

export function startQASession(modelId: string): QASession {
  const session: QASession = {
    sessionId: `hindi-qa-${Date.now()}`,
    modelId,
    startedAtMs: Date.now(),
    results: [],
  };
  activeSession = session;
  return session;
}

export function recordQAResult(result: Omit<QAResult, 'timestampMs'>): void {
  if (!__DEV__ || activeSession === null) return;
  activeSession.results.push({ ...result, timestampMs: Date.now() });
}

export function finalizeQASession(): QASession | null {
  if (!__DEV__ || activeSession === null) return null;
  activeSession.completedAtMs = Date.now();
  const finished = activeSession;
  activeSession = null;
  return finished;
}

export function getActiveSession(): QASession | null {
  return activeSession;
}

// ── BLEU / chrF heuristics (lightweight, no external deps) ───────────────────

/**
 * Unigram BLEU approximation against a single reference.
 * Good enough for pass/fail threshold; not a substitute for sacrebleu.
 */
export function computeUnigramBLEU(hypothesis: string, reference: string): number {
  const hypTokens = tokenize(hypothesis);
  const refTokens = new Set(tokenize(reference));
  if (hypTokens.length === 0) return 0;
  const matches = hypTokens.filter((t) => refTokens.has(t)).length;
  const precision = matches / hypTokens.length;
  const brevityPenalty =
    hypTokens.length < refTokens.size ? Math.exp(1 - refTokens.size / hypTokens.length) : 1;
  return brevityPenalty * precision;
}

/**
 * Character F-score (chrF) approximation — character n-gram F1, n=6.
 * Suitable for morphologically rich languages like Hindi.
 */
export function computeChrF(hypothesis: string, reference: string, n = 6): number {
  // Fast path: identical strings always score 1.0 regardless of length vs n.
  if (hypothesis === reference && hypothesis.length > 0) return 1.0;
  const hypNgrams = charNgrams(hypothesis, n);
  const refNgrams = charNgrams(reference, n);
  if (hypNgrams.size === 0 || refNgrams.size === 0) return 0;

  let matches = 0;
  for (const ngram of hypNgrams) {
    if (refNgrams.has(ngram)) matches++;
  }

  const precision = matches / hypNgrams.size;
  const recall = matches / refNgrams.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function charNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  const cleaned = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.add(cleaned.slice(i, i + n));
  }
  return ngrams;
}

// ── Acceptance threshold constants (founder sets after dogfood) ──────────────

/** Placeholder — founder updates after running the 60-prompt suite. */
export const HINDI_ACCEPTANCE_THRESHOLD = {
  /** Minimum average human score across all 60 prompts */
  minOverallHumanScore: NaN,
  /** Minimum per-category average human score */
  minPerCategoryScore: NaN,
  /** BLEU threshold for translation category */
  minBleu: NaN,
  /** chrF threshold for translation / summarization */
  minChrF: NaN,
} as const;
