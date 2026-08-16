
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
  referenceOutput?: string;
  humanEvalRequired: boolean;
}

export interface QAResult {
  promptId: string;
  modelOutput: string;
  bleuScore?: number;
  chrFScore?: number;
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

export function computeChrF(hypothesis: string, reference: string, n = 6): number {
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

export const HINDI_ACCEPTANCE_THRESHOLD = {
  minOverallHumanScore: NaN,
  minPerCategoryScore: NaN,
  minBleu: NaN,
  minChrF: NaN,
} as const;
