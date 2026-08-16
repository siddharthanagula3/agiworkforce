

const SMALL_CONTEXT_MODEL_ID = 'fixture-small-context-model';
const LARGE_CONTEXT_MODEL_ID = 'fixture-large-context-model';

jest.mock('@/lib/models', () => {
  const catalog = new Map([
    [
      'fixture-small-context-model',
      {
        id: 'fixture-small-context-model',
        name: 'Small Context Fixture',
        provider: 'fixture-provider',
        contextWindow: 4096,
        maxOutput: 512,
        supportsVision: false,
        supportsThinking: false,
        tier: 'economy',
      },
    ],
    [
      'fixture-large-context-model',
      {
        id: 'fixture-large-context-model',
        name: 'Large Context Fixture',
        provider: 'fixture-provider',
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

function makeMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id,
    conversationId: 'conv-1',
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function makeMessages(count: number, charsPerMessage: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(`msg-${i}`, i % 2 === 0 ? 'user' : 'assistant', 'a'.repeat(charsPerMessage)),
  );
}

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
      expect(estimateTokens('abc')).toBe(1);
      expect(estimateTokens('abcde')).toBe(2);
    });
  });

  describe('computeContextBudget — small context (4K)', () => {
    const modelId = SMALL_CONTEXT_MODEL_ID;

    it('returns ok status when usage is low', () => {
      const messages = makeMessages(2, 100);
      const budget = computeContextBudget(modelId, messages);
      expect(budget.status).toBe('ok');
      expect(budget.usedFraction).toBeLessThan(0.7);
    });

    it('returns warn status when 70-80% full', () => {
      const messages = makeMessages(3, 4000);
      const budget = computeContextBudget(modelId, messages);
      expect(['warn', 'compact']).toContain(budget.status);
    });

    it('returns compact status when >= 80% full', () => {
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

  describe('computeContextBudget — large context (262K)', () => {
    const modelId = LARGE_CONTEXT_MODEL_ID;

    it('stays ok with thousands of normal messages', () => {
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
      expect(needsCompaction(SMALL_CONTEXT_MODEL_ID, messages)).toBe(false);
    });

    it('returns true when status is compact', () => {
      const messages = makeMessages(5, 2800);
      expect(needsCompaction(SMALL_CONTEXT_MODEL_ID, messages)).toBe(true);
    });
  });
});

describe('memoryCompactor', () => {
  describe('compact — small context (4K)', () => {
    const modelId = SMALL_CONTEXT_MODEL_ID;

    it('no-ops when budget is ok', async () => {
      const messages = makeMessages(4, 50);
      const result = await compact(modelId, messages);
      expect(result.compacted).toBe(false);
      expect(result.droppedTurns).toBe(0);
      expect(result.messages).toBe(messages);
    });

    it('compacts when at 80% threshold', async () => {
      const messages = makeMessages(5, 2800);
      const result = await compact(modelId, messages);
      expect(result.compacted).toBe(true);
      expect(result.droppedTurns).toBeGreaterThan(0);
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
        const keptInResult = result.messages.slice(1);
        expect(keptInResult.length).toBe(keptCount);
        for (let i = 0; i < keptOriginals.length; i++) {
          expect(keptInResult[i]).toBe(keptOriginals[i]);
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

describe('ragChunker', () => {
  describe('getRagChunkingConfig', () => {
    it('small context (4K) → targetTokens = 25% of 4096', () => {
      const config = getRagChunkingConfig(SMALL_CONTEXT_MODEL_ID);
      expect(config.targetTokens).toBe(Math.floor(4096 * 0.25));
    });

    it('small context (4K) → overlapTokens = 10% of targetTokens', () => {
      const config = getRagChunkingConfig(SMALL_CONTEXT_MODEL_ID);
      const expectedTarget = Math.floor(4096 * 0.25);
      expect(config.overlapTokens).toBe(Math.floor(expectedTarget * 0.1));
    });

    it('small context (4K) → maxChunksPerQuery = 4', () => {
      const config = getRagChunkingConfig(SMALL_CONTEXT_MODEL_ID);
      expect(config.maxChunksPerQuery).toBe(4);
    });

    it('large context (262K) → targetTokens = 25% of 262144', () => {
      const config = getRagChunkingConfig(LARGE_CONTEXT_MODEL_ID);
      expect(config.targetTokens).toBe(Math.floor(262144 * 0.25));
    });

    it('large context (262K) → maxChunksPerQuery = 16', () => {
      const config = getRagChunkingConfig(LARGE_CONTEXT_MODEL_ID);
      expect(config.maxChunksPerQuery).toBe(16);
    });
  });

  describe('chunkForModel', () => {
    it('returns single chunk for short text', () => {
      const text = 'Hello world this is a short document.';
      const chunks = chunkForModel(text, SMALL_CONTEXT_MODEL_ID);
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkIndex).toBe(0);
    });

    it('returns empty array for empty text', () => {
      const chunks = chunkForModel('', SMALL_CONTEXT_MODEL_ID);
      expect(chunks.length).toBe(0);
    });

    it('the small-context fixture produces smaller chunks than the large fixture', () => {
      const text = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(' ');
      const smallContextChunks = chunkForModel(text, SMALL_CONTEXT_MODEL_ID);
      const largeContextChunks = chunkForModel(text, LARGE_CONTEXT_MODEL_ID);

      expect(smallContextChunks.length).toBeGreaterThan(largeContextChunks.length);
    });

    it('chunks have overlapping content', () => {
      const wordCount = 2000;
      const words = Array.from({ length: wordCount }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkForModel(text, SMALL_CONTEXT_MODEL_ID);
      if (chunks.length < 2) return;

      const chunk0Words = chunks[0].text.split(' ');
      const chunk1Words = chunks[1].text.split(' ');
      const chunk1Start = chunk1Words[0];
      expect(chunk0Words).toContain(chunk1Start);
    });

    it('each chunk has a positive tokenCount', () => {
      const text = Array.from({ length: 500 }, (_, i) => `tok${i}`).join(' ');
      const chunks = chunkForModel(text, SMALL_CONTEXT_MODEL_ID);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });

    it('chunkIndex is sequential from 0', () => {
      const text = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
      const chunks = chunkForModel(text, SMALL_CONTEXT_MODEL_ID);
      chunks.forEach((chunk, i) => {
        expect(chunk.chunkIndex).toBe(i);
      });
    });
  });

  describe('getMaxChunksForModel', () => {
    it('returns 4 for the small-context model', () => {
      expect(getMaxChunksForModel(SMALL_CONTEXT_MODEL_ID)).toBe(4);
    });

    it('returns 16 for the large-context model', () => {
      expect(getMaxChunksForModel(LARGE_CONTEXT_MODEL_ID)).toBe(16);
    });
  });
});
