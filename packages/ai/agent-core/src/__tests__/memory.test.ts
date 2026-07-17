import { describe, expect, it } from 'vitest';
import {
  boostMemoryImportance,
  classifyMemoryCategory,
  cosineSimilarity,
  decayMemoryImportance,
  memoryRelevanceScore,
  normalizeMemoryKey,
} from '../memory';

describe('shared memory engine', () => {
  it('classifies and normalizes memory facts', () => {
    expect(classifyMemoryCategory('User prefers Rust over Go')).toBe('preference');
    expect(classifyMemoryCategory('We decided to keep SQLite local')).toBe('decision');
    expect(normalizeMemoryKey('  User   PREFERS\nRust  ')).toBe('user prefers rust');
  });

  it('applies the canonical decay and boost policy', () => {
    expect(decayMemoryImportance(10, 14)).toBe(8);
    expect(decayMemoryImportance(2, 365)).toBe(1);
    expect(boostMemoryImportance(9)).toBe(10);
  });

  it('rejects invalid embeddings', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
    expect(cosineSimilarity([1], [1, 0])).toBeNull();
    expect(cosineSimilarity([Number.NaN], [1])).toBeNull();
  });

  it('uses a valid embedding signal in relevance scoring', () => {
    const base = { lexicalSimilarity: 0.2, importance: 8, daysSinceAccess: 1 };
    const withEmbedding = memoryRelevanceScore({ ...base, embeddingSimilarity: 0.9 });
    const lexicalOnly = memoryRelevanceScore(base);
    expect(withEmbedding).toBeGreaterThan(lexicalOnly);
    expect(withEmbedding).toBeGreaterThanOrEqual(0);
    expect(withEmbedding).toBeLessThanOrEqual(1);
  });

  it('respects surface retrieval weighting', () => {
    const base = {
      lexicalSimilarity: 0.9,
      embeddingSimilarity: 0.1,
      importance: 5,
      daysSinceAccess: 0,
    };
    expect(memoryRelevanceScore({ ...base, lexicalWeight: 0.8 })).toBeGreaterThan(
      memoryRelevanceScore({ ...base, lexicalWeight: 0.2 }),
    );
  });
});
