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
