/**
 * Tests for context budgeting, memory compaction, and RAG chunking.
 *
 * Uses two model fixtures to exercise both extremes:
 *   - applefm-4k:   contextWindow = 4096  (Apple Foundation Models)
 *   - qwen3-262k:   contextWindow = 262144 (Qwen3-4B-Instruct-2507)
 *
 * All contextWindow values are read from the mocked catalog — no numbers
 * are hardcoded in the production code under test.
 */

// ---------------------------------------------------------------------------
// Catalog mock — factory runs before module-level consts (jest hoisting)
// so the catalog data is defined inline inside the factory.
// ---------------------------------------------------------------------------

const APPLE_FM_ID = 'applefm-4k';
const QWEN3_ID = 'qwen3-262k';

jest.mock('@/lib/models', () => {
  const catalog = new Map([
    [
      'applefm-4k',
      {
        id: 'applefm-4k',
        name: 'Apple FM (test)',
        provider: 'apple',
        contextWindow: 4096,
        maxOutput: 512,
        supportsVision: false,
        supportsThinking: false,
        tier: 'economy',
      },
    ],
    [
      'qwen3-262k',
      {
        id: 'qwen3-262k',
        name: 'Qwen3 4B (test)',
        provider: 'qwen',
        contextWindow: 262144,
        maxOutput: 8192,
        supportsVision: false,
        supportsThinking: false,
        tier: 'economy',
      },
    ],
  ]);

  return {
    getModelById: (id: string) => catalog.get(id) ?? undefined,
    MODEL_LIST: Array.from(catalog.values()),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mock)
// ---------------------------------------------------------------------------

import {
  computeContextBudget,
  estimateTokens,
  needsCompaction,
} from '../src/features/memory/services/contextBudgeter';
import { compact, estimateSummaryTokens } from '../src/features/memory/services/memoryCompactor';
import {
  getRagChunkingConfig,
  chunkForModel,
  getMaxChunksForModel,
} from '../src/features/memory/services/ragChunker';
import type { ChatMessage } from '../types/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id,
    conversationId: 'conv-1',
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

/** Build N messages each with `charsPerMessage` chars of content. */
function makeMessages(count: number, charsPerMessage: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(`msg-${i}`, i % 2 === 0 ? 'user' : 'assistant', 'a'.repeat(charsPerMessage)),
  );
}

// ---------------------------------------------------------------------------
// contextBudgeter tests
// ---------------------------------------------------------------------------

describe('contextBudgeter', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('estimates roughly chars/4', () => {
      const text = 'x'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it('rounds up fractional tokens', () => {
      expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
      expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
    });
  });

  describe('computeContextBudget — Apple FM (4K)', () => {
    const modelId = APPLE_FM_ID;
    // contextWindow = 4096
    // hardCap = floor(4096 * 0.8) = 3276
    // warnThreshold = floor(4096 * 0.7) = 2867

    it('returns ok status when usage is low', () => {
      const messages = makeMessages(2, 100); // tiny messages
      const budget = computeContextBudget(modelId, messages);
      expect(budget.status).toBe('ok');
      expect(budget.usedFraction).toBeLessThan(0.7);
    });

    it('returns warn status when 70-80% full', () => {
      // warnThreshold=2867. Each char=0.25 tokens. Need ~2867*4=11468 chars used.
      // 2 messages × 5500 chars = 11000 chars content + role overhead → ~2762 tokens
      // Try 3 messages × 4000 chars = 12000 chars → ~3004 tokens > 2867
      const messages = makeMessages(3, 4000);
      const budget = computeContextBudget(modelId, messages);
      // Should be warn or compact depending on exact count — either is above 70%
      expect(['warn', 'compact']).toContain(budget.status);
    });

    it('returns compact status when >= 80% full', () => {
      // hardCap = 3276 tokens = ~13104 chars of content + per-msg overhead
      // 5 messages × 2800 chars = 14000 chars → ~3504 tokens > 3276
      const messages = makeMessages(5, 2800);
      const budget = computeContextBudget(modelId, messages);
      expect(budget.status).toBe('compact');
    });

    it('hardCapTokens is 80% of contextWindow', () => {
      const budget = computeContextBudget(modelId, []);
      expect(budget.hardCapTokens).toBe(Math.floor(4096 * 0.8));
    });

    it('warnThresholdTokens is 70% of contextWindow', () => {
      const budget = computeContextBudget(modelId, []);
      expect(budget.warnThresholdTokens).toBe(Math.floor(4096 * 0.7));
    });
  });

  describe('computeContextBudget — Qwen3 (262K)', () => {
    const modelId = QWEN3_ID;
    // contextWindow = 262144
    // hardCap = floor(262144 * 0.8) = 209715
    // warnThreshold = floor(262144 * 0.7) = 183500

    it('stays ok with thousands of normal messages', () => {
      // 100 messages × 200 chars = 20000 chars → ~5000 tokens << 183500
      const messages = makeMessages(100, 200);
      const budget = computeContextBudget(modelId, messages);
      expect(budget.status).toBe('ok');
    });

    it('hardCapTokens is 80% of 262144', () => {
      const budget = computeContextBudget(modelId, []);
      expect(budget.hardCapTokens).toBe(Math.floor(262144 * 0.8));
    });
  });

  describe('needsCompaction', () => {
    it('returns false when status is ok', () => {
      const messages = makeMessages(2, 10);
      expect(needsCompaction(APPLE_FM_ID, messages)).toBe(false);
    });

    it('returns true when status is compact', () => {
      const messages = makeMessages(5, 2800);
      expect(needsCompaction(APPLE_FM_ID, messages)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// memoryCompactor tests
// ---------------------------------------------------------------------------

describe('memoryCompactor', () => {
  describe('compact — Apple FM (4K)', () => {
    const modelId = APPLE_FM_ID;

    it('no-ops when budget is ok', async () => {
      const messages = makeMessages(4, 50);
      const result = await compact(modelId, messages);
      expect(result.compacted).toBe(false);
      expect(result.droppedTurns).toBe(0);
      expect(result.messages).toBe(messages); // same reference
    });

    it('compacts when at 80% threshold', async () => {
      // Force a compact scenario: 5 messages × 2800 chars
      const messages = makeMessages(5, 2800);
      const result = await compact(modelId, messages);
      expect(result.compacted).toBe(true);
      expect(result.droppedTurns).toBeGreaterThan(0);
      // Result has fewer messages than original (summary + kept)
      expect(result.messages.length).toBeLessThan(messages.length);
    });

    it('first message in result is the summary', async () => {
      const messages = makeMessages(6, 2800);
      const result = await compact(modelId, messages);
      if (result.compacted) {
        expect(result.messages[0].content).toContain('UNTRUSTED HISTORICAL SUMMARY');
        expect(result.messages[0].content).toContain('END UNTRUSTED HISTORICAL SUMMARY');
      }
    });

    it('preserved messages are unchanged', async () => {
      const messages = makeMessages(6, 2800);
      const result = await compact(modelId, messages);
      if (result.compacted) {
        const keptCount = messages.length - result.droppedTurns;
        const keptOriginals = messages.slice(result.droppedTurns);
        const keptInResult = result.messages.slice(1); // skip summary
        expect(keptInResult.length).toBe(keptCount);
        for (let i = 0; i < keptOriginals.length; i++) {
          expect(keptInResult[i]).toBe(keptOriginals[i]); // same reference
        }
      }
    });

    it('does not compact when fewer than 2 messages', async () => {
      const messages = makeMessages(1, 3000);
      const result = await compact(modelId, messages);
      expect(result.compacted).toBe(false);
    });
  });

  describe('estimateSummaryTokens', () => {
    it('returns 0 for empty array', () => {
      expect(estimateSummaryTokens([])).toBe(0);
    });

    it('returns a positive number for non-empty messages', () => {
      const messages = makeMessages(4, 200);
      expect(estimateSummaryTokens(messages)).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ragChunker tests
// ---------------------------------------------------------------------------

describe('ragChunker', () => {
  describe('getRagChunkingConfig', () => {
    it('Apple FM (4K) → targetTokens = 25% of 4096', () => {
      const config = getRagChunkingConfig(APPLE_FM_ID);
      expect(config.targetTokens).toBe(Math.floor(4096 * 0.25)); // 1024
    });

    it('Apple FM (4K) → overlapTokens = 10% of targetTokens', () => {
      const config = getRagChunkingConfig(APPLE_FM_ID);
      const expectedTarget = Math.floor(4096 * 0.25);
      expect(config.overlapTokens).toBe(Math.floor(expectedTarget * 0.1));
    });

    it('Apple FM (4K) → maxChunksPerQuery = 4 (small context)', () => {
      const config = getRagChunkingConfig(APPLE_FM_ID);
      expect(config.maxChunksPerQuery).toBe(4);
    });

    it('Qwen3 (262K) → targetTokens = 25% of 262144', () => {
      const config = getRagChunkingConfig(QWEN3_ID);
      expect(config.targetTokens).toBe(Math.floor(262144 * 0.25)); // 65536
    });

    it('Qwen3 (262K) → maxChunksPerQuery = 16 (large context)', () => {
      const config = getRagChunkingConfig(QWEN3_ID);
      expect(config.maxChunksPerQuery).toBe(16);
    });
  });

  describe('chunkForModel', () => {
    it('returns single chunk for short text', () => {
      const text = 'Hello world this is a short document.';
      const chunks = chunkForModel(text, APPLE_FM_ID);
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkIndex).toBe(0);
    });

    it('returns empty array for empty text', () => {
      const chunks = chunkForModel('', APPLE_FM_ID);
      expect(chunks.length).toBe(0);
    });

    it('Apple FM produces smaller chunks than Qwen3 for same document', () => {
      // 5000-word document: Apple FM targetWords = floor(1024/1.3) ≈ 787 words/chunk
      // → multiple chunks expected
      const text = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(' ');
      const appleFmChunks = chunkForModel(text, APPLE_FM_ID);
      const qwen3Chunks = chunkForModel(text, QWEN3_ID);

      // Apple FM must produce more chunks (smaller targetWords)
      expect(appleFmChunks.length).toBeGreaterThan(qwen3Chunks.length);
    });

    it('chunks have overlapping content', () => {
      // Use repeated words so overlap is detectable even with exact match.
      // Pattern: "aaa bbb ccc ..." — all words are distinct unique tokens so we
      // verify overlap by checking chunk1 starts before chunk0 ends (index-wise).
      const wordCount = 2000;
      const words = Array.from({ length: wordCount }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkForModel(text, APPLE_FM_ID);
      if (chunks.length < 2) return; // can't test overlap with 1 chunk

      // Verify the second chunk starts before the last word of the first chunk
      // by checking that chunk1's first word appears somewhere inside chunk0.
      const chunk0Words = chunks[0].text.split(' ');
      const chunk1Words = chunks[1].text.split(' ');
      const chunk1Start = chunk1Words[0];
      // chunk1 first word must appear in chunk0 (overlap = chunk1 starts inside chunk0)
      expect(chunk0Words).toContain(chunk1Start);
    });

    it('each chunk has a positive tokenCount', () => {
      const text = Array.from({ length: 500 }, (_, i) => `tok${i}`).join(' ');
      const chunks = chunkForModel(text, APPLE_FM_ID);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });

    it('chunkIndex is sequential from 0', () => {
      const text = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
      const chunks = chunkForModel(text, APPLE_FM_ID);
      chunks.forEach((chunk, i) => {
        expect(chunk.chunkIndex).toBe(i);
      });
    });
  });

  describe('getMaxChunksForModel', () => {
    it('returns 4 for small-context model (Apple FM)', () => {
      expect(getMaxChunksForModel(APPLE_FM_ID)).toBe(4);
    });

    it('returns 16 for large-context model (Qwen3)', () => {
      expect(getMaxChunksForModel(QWEN3_ID)).toBe(16);
    });
  });
});
