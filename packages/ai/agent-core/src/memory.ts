export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'context' | 'summary' | 'skill';

export interface MemoryDecayConfig {
  enabled?: boolean;
  decayRate?: number;
  decayPeriodDays?: number;
  minImportance?: number;
  maxImportance?: number;
  accessBoost?: number;
}

export interface MemoryRelevanceInput {
  lexicalSimilarity: number;
  embeddingSimilarity?: number;
  /** Lexical share of retrieval relevance when an embedding is available. */
  lexicalWeight?: number;
  importance: number;
  daysSinceAccess: number;
}

/** Max characters of a captured self-disclosure clause kept as a fact. */
const MAX_EXTRACTED_CLAUSE_CHARS = 120;
const MIN_EXTRACTED_CLAUSE_CHARS = 2;

interface MemoryExtractionPattern {
  re: RegExp;
  format: (value: string) => string;
}

const MEMORY_EXTRACTION_PATTERNS: readonly MemoryExtractionPattern[] = [
  { re: /\bmy name is\s+(.+)/i, format: (value) => `User's name is ${value}` },
  { re: /\bi am a\s+(.+)/i, format: (value) => `User is a ${value}` },
  { re: /\bi'm a\s+(.+)/i, format: (value) => `User is a ${value}` },
  { re: /\bi am an\s+(.+)/i, format: (value) => `User is an ${value}` },
  { re: /\bi'm an\s+(.+)/i, format: (value) => `User is an ${value}` },
  { re: /\bi work as\s+(.+)/i, format: (value) => `User works as ${value}` },
  { re: /\bi work at\s+(.+)/i, format: (value) => `User works at ${value}` },
  { re: /\bi work in\s+(.+)/i, format: (value) => `User works in ${value}` },
  { re: /\bi live in\s+(.+)/i, format: (value) => `User lives in ${value}` },
  { re: /\bi'm from\s+(.+)/i, format: (value) => `User is from ${value}` },
  { re: /\bi am from\s+(.+)/i, format: (value) => `User is from ${value}` },
  { re: /\bi prefer\s+(.+)/i, format: (value) => `User prefers ${value}` },
  { re: /\bi really like\s+(.+)/i, format: (value) => `User likes ${value}` },
  { re: /\bi like\s+(.+)/i, format: (value) => `User likes ${value}` },
  { re: /\bi love\s+(.+)/i, format: (value) => `User loves ${value}` },
  { re: /\bi hate\s+(.+)/i, format: (value) => `User dislikes ${value}` },
  { re: /\bi don't like\s+(.+)/i, format: (value) => `User dislikes ${value}` },
  { re: /\bremember that\s+(.+)/i, format: capitalizeMemoryClause },
  { re: /\bremember:\s+(.+)/i, format: capitalizeMemoryClause },
  { re: /\bnote that\s+(.+)/i, format: capitalizeMemoryClause },
  { re: /\bfor future reference[,:]?\s+(.+)/i, format: capitalizeMemoryClause },
];

function capitalizeMemoryClause(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

const TRAILING_PUNCTUATION = new Set(['.', '!', '?', ',', ';', ':']);

function isTrailingNoise(ch: string): boolean {
  return TRAILING_PUNCTUATION.has(ch) || /\s/u.test(ch);
}

function cleanMemoryClause(value: string): string {
  // Was `.replace(/[.!?,;:\s]+$/u, '')`. An anchored `+` over a repeated
  // character class backtracks quadratically: on a clause ending in a long run
  // of punctuation or whitespace the engine retries from every position before
  // it can fail. Memory clauses come from model output, so a degenerate run is
  // cheap for the model to emit and costly for us to reject
  // (js/polynomial-redos). One backward scan does the same job in O(n).
  const trimmed = value.trim();
  let end = trimmed.length;
  while (end > 0 && isTrailingNoise(trimmed[end - 1]!)) {
    end -= 1;
  }
  return trimmed.slice(0, end).trim();
}

function splitMemorySentences(value: string): string[] {
  return value
    .split(/(?<=[.!?\n])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Conservatively extract durable first-person self-disclosures from one user
 * message. Precision wins over recall: questions, long clauses, and messages
 * without an explicit supported pattern produce no facts.
 */
export function extractCandidateMemoryFacts(message: string): string[] {
  if (!message || typeof message !== 'string') return [];

  const facts: string[] = [];
  const seen = new Set<string>();
  for (const sentence of splitMemorySentences(message)) {
    if (sentence.trimEnd().endsWith('?')) continue;

    for (const pattern of MEMORY_EXTRACTION_PATTERNS) {
      const match = pattern.re.exec(sentence);
      if (!match) continue;
      const clause = cleanMemoryClause(match[1] ?? '');
      if (
        clause.length < MIN_EXTRACTED_CLAUSE_CHARS ||
        clause.length > MAX_EXTRACTED_CLAUSE_CHARS
      ) {
        break;
      }
      const fact = pattern.format(clause).trim();
      const key = fact.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        facts.push(fact);
      }
      break;
    }
  }
  return facts;
}

const DEFAULT_DECAY = {
  enabled: true,
  decayRate: 0.1,
  decayPeriodDays: 7,
  minImportance: 1,
  maxImportance: 10,
  accessBoost: 1,
} as const;

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function normalizeMemoryKey(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function classifyMemoryCategory(value: string): MemoryCategory {
  const normalized = normalizeMemoryKey(value);
  if (
    [
      ' prefer',
      'prefers ',
      ' like',
      ' likes ',
      ' love',
      ' loves ',
      ' hate',
      ' dislike',
      'favorite',
      'favourite',
    ].some((needle) => normalized.includes(needle))
  ) {
    return 'preference';
  }
  if (
    ['decided', 'decision', 'we will', 'must use', 'chosen', 'chose '].some((needle) =>
      normalized.includes(needle),
    )
  ) {
    return 'decision';
  }
  if (
    ['remember', 'note that', 'for future reference', 'context:'].some((needle) =>
      normalized.includes(needle),
    )
  ) {
    return 'context';
  }
  return 'fact';
}

export function decayMemoryImportance(
  currentImportance: number,
  daysSinceAccess: number,
  config: MemoryDecayConfig = {},
): number {
  const minimum = Math.floor(finite(config.minImportance, DEFAULT_DECAY.minImportance));
  const maximum = Math.max(
    minimum,
    Math.floor(finite(config.maxImportance, DEFAULT_DECAY.maxImportance)),
  );
  const current = Math.min(maximum, Math.max(minimum, Math.floor(currentImportance)));
  if (config.enabled === false) return current;
  const period = Math.floor(finite(config.decayPeriodDays, DEFAULT_DECAY.decayPeriodDays));
  if (period <= 0 || daysSinceAccess <= 0) return current;
  const periods = Math.floor(daysSinceAccess / period);
  if (periods <= 0) return current;
  const rate = Math.min(1, Math.max(0, finite(config.decayRate, DEFAULT_DECAY.decayRate)));
  const decay = Math.floor(current * rate * periods);
  return current - Math.min(Math.max(0, decay), current - minimum);
}

export function boostMemoryImportance(
  currentImportance: number,
  config: MemoryDecayConfig = {},
): number {
  const minimum = Math.floor(finite(config.minImportance, DEFAULT_DECAY.minImportance));
  const maximum = Math.max(
    minimum,
    Math.floor(finite(config.maxImportance, DEFAULT_DECAY.maxImportance)),
  );
  const current = Math.min(maximum, Math.max(minimum, Math.floor(currentImportance)));
  if (config.enabled === false) return current;
  const boost = Math.max(0, Math.floor(finite(config.accessBoost, DEFAULT_DECAY.accessBoost)));
  return Math.min(maximum, current + boost);
}

export function isValidEmbedding(embedding: readonly number[]): boolean {
  if (embedding.length === 0 || !embedding.every(Number.isFinite)) return false;
  return Math.sqrt(embedding.reduce((total, value) => total + value * value, 0)) > 1e-8;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || !isValidEmbedding(left) || !isValidEmbedding(right)) {
    return null;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const similarity = dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  return Number.isFinite(similarity) ? Math.min(1, Math.max(-1, similarity)) : null;
}

export function memoryRelevanceScore(input: MemoryRelevanceInput): number {
  const lexical = Math.min(1, Math.max(0, input.lexicalSimilarity));
  const importance = Math.min(10, Math.max(1, input.importance)) / 10;
  const recency = Math.pow(0.5, Math.max(0, input.daysSinceAccess) / 30);
  const embedding = input.embeddingSimilarity;
  const lexicalWeight = Math.min(1, Math.max(0, input.lexicalWeight ?? 0.25));
  const score =
    embedding !== undefined && Number.isFinite(embedding)
      ? (lexical * lexicalWeight + Math.min(1, Math.max(0, embedding)) * (1 - lexicalWeight)) *
          0.8 +
        importance * 0.15 +
        recency * 0.05
      : lexical * 0.7 + importance * 0.2 + recency * 0.1;
  return Math.min(1, Math.max(0, score));
}
