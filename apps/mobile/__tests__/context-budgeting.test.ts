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

  describe('computeContextBudget, small context (4K)', () => {
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

  describe('computeContextBudget, large context (262K)', () => {
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
