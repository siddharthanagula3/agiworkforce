/**
 * Token Usage Tracker Tests
 * Unit tests for the Token Logger Service that tracks LLM token usage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getModelMetadataById } from '@agiworkforce/types';
import { tokenLogger, logTokenUsage } from './token-usage-tracker';

const OPENAI_MODEL = 'gpt-5.4';
const ANTHROPIC_MODEL = 'claude-sonnet-4.6';
const GOOGLE_MODEL = 'gemini-3.1-flash-lite';
const PERPLEXITY_MODEL = 'sonar-pro';
const GROK_MODEL = 'grok-4';
const CLAUDE_HAIKU_MODEL = 'claude-haiku-4.5';

function expectedCostForModel(model: string, inputTokens: number, outputTokens: number): number {
  const metadata = getModelMetadataById(model);
  if (!metadata) {
    return (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 1;
  }

  return (
    (inputTokens / 1_000_000) * metadata.inputCost +
    (outputTokens / 1_000_000) * metadata.outputCost
  );
}

// Mock the UsageTracker class - define inside factory to avoid hoisting issues
vi.mock('@features/billing/services/usage-monitor', () => {
  const mockFn = vi.fn().mockResolvedValue(undefined);
  return {
    UsageTracker: class MockUsageTracker {
      trackAPICall = mockFn;
      static __mockTrackAPICall = mockFn;
    },
    __getMockTrackAPICall: () => mockFn,
  };
});

describe('Token Usage Tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenLogger.clearAllCaches();

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    tokenLogger.clearAllCaches();
  });

  describe('logTokenUsage', () => {
    it('should log token usage successfully', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-456',
        'agent-789',
        'Test Agent',
        40,
        60,
        'Test task',
      );

      const summary = tokenLogger.getSessionSummary('session-456');

      expect(summary).toBeDefined();
      expect(summary?.totalTokens).toBe(100);
      expect(summary?.userId).toBe('user-123');
    });

    it('should use default session ID when not provided', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123');

      const summary = tokenLogger.getSessionSummary('default');

      expect(summary).toBeDefined();
      expect(summary?.totalTokens).toBe(100);
    });

    it('should accumulate tokens for same session', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage('gpt-5.4', 150, 'user-123', 'session-1');

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.totalTokens).toBe(250);
    });

    it('should track by model correctly', async () => {
      await tokenLogger.logTokenUsage(
        OPENAI_MODEL,
        100,
        'user-123',
        'session-1',
        undefined,
        undefined,
        40,
        60,
      );
      await tokenLogger.logTokenUsage(
        ANTHROPIC_MODEL,
        200,
        'user-123',
        'session-1',
        undefined,
        undefined,
        80,
        120,
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.byModel[OPENAI_MODEL]).toBeDefined();
      expect(summary?.byModel[OPENAI_MODEL]?.totalTokens).toBe(100);
      expect(summary?.byModel[ANTHROPIC_MODEL]).toBeDefined();
      expect(summary?.byModel[ANTHROPIC_MODEL]?.totalTokens).toBe(200);
    });

    it('should calculate cost correctly', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        1000,
        'user-123',
        'session-1',
        undefined,
        undefined,
        400,
        600,
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      // gpt-5.4: input $2.5/1M, output $10/1M
      // 400 input tokens = 0.001, 600 output tokens = 0.006
      expect(summary?.totalCost).toBeGreaterThan(0);
    });

    it('should estimate input/output tokens when not provided', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 1000, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.inputTokens!).toBe(400); // 40% of 1000
      expect(logs![0]!.outputTokens!).toBe(600); // 60% of 1000
    });

    it('should use provided agent info', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-1',
        'agent-custom',
        'Custom Agent Name',
      );

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.agentId!).toBe('agent-custom');
      expect(logs![0]!.agentName!).toBe('Custom Agent Name');
    });

    it('should handle concurrent calls safely', async () => {
      const promises = Array.from({ length: 10 }, (_, _i) =>
        tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1'),
      );

      await Promise.all(promises);

      const summary = tokenLogger.getSessionSummary('session-1');
      expect(summary?.totalTokens).toBe(1000);
    });

    it('should increment call count per model', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.byModel['gpt-5.4']?.callCount).toBe(3);
    });
  });

  describe('calculateCost', () => {
    it('should calculate GPT-5.4 cost correctly', () => {
      const cost = tokenLogger.calculateCost(OPENAI_MODEL, 1000000, 1000000);

      expect(cost).toBe(expectedCostForModel(OPENAI_MODEL, 1000000, 1000000));
    });

    it('should calculate Claude cost correctly', () => {
      const cost = tokenLogger.calculateCost(ANTHROPIC_MODEL, 1000000, 1000000);

      expect(cost).toBe(expectedCostForModel(ANTHROPIC_MODEL, 1000000, 1000000));
    });

    it('should calculate Gemini cost correctly', () => {
      const cost = tokenLogger.calculateCost(GOOGLE_MODEL, 1000000, 1000000);

      expect(cost).toBe(expectedCostForModel(GOOGLE_MODEL, 1000000, 1000000));
    });

    it('should use default pricing for unknown models', () => {
      const cost = tokenLogger.calculateCost('unknown-model', 1000000, 1000000);

      // Default: $1/1M for both
      expect(cost).toBe(2);
    });

    it('should handle zero tokens', () => {
      const cost = tokenLogger.calculateCost('gpt-5.4', 0, 0);

      expect(cost).toBe(0);
    });
  });

  describe('getSessionSummary', () => {
    it('should return null for non-existent session', () => {
      const summary = tokenLogger.getSessionSummary('non-existent');

      expect(summary).toBeNull();
    });

    it('should return correct session summary', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-1',
        undefined,
        undefined,
        40,
        60,
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.sessionId).toBe('session-1');
      expect(summary?.userId).toBe('user-123');
      expect(summary?.totalTokens).toBe(100);
      expect(summary?.startTime).toBeInstanceOf(Date);
      expect(summary?.lastUpdate).toBeInstanceOf(Date);
    });
  });

  describe('getSessionLogs', () => {
    it('should return empty array for non-existent session', () => {
      const logs = tokenLogger.getSessionLogs('non-existent');

      expect(logs).toEqual([]);
    });

    it('should return all logs for session', async () => {
      await tokenLogger.logTokenUsage(OPENAI_MODEL, 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage(ANTHROPIC_MODEL, 200, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs.length).toBe(2);
    });

    it('should include task description in logs', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-1',
        undefined,
        undefined,
        undefined,
        undefined,
        'Generating code review',
      );

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.taskDescription!).toBe('Generating code review');
    });
  });

  describe('getRealtimeUsage', () => {
    it('should return zeros for non-existent session', () => {
      const usage = tokenLogger.getRealtimeUsage('non-existent');

      expect(usage.totalTokens).toBe(0);
      expect(usage.totalCost).toBe(0);
      expect(usage.byModel).toEqual({});
    });

    it('should return current usage', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-1',
        undefined,
        undefined,
        40,
        60,
      );

      const usage = tokenLogger.getRealtimeUsage('session-1');

      expect(usage.totalTokens).toBe(100);
      expect(usage.totalCost).toBeGreaterThan(0);
      expect(usage.byModel['gpt-5.4']).toBeDefined();
    });
  });

  describe('clearSessionCache', () => {
    it('should clear specific session cache', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-2');

      tokenLogger.clearSessionCache('session-1');

      expect(tokenLogger.getSessionSummary('session-1')).toBeNull();
      expect(tokenLogger.getSessionSummary('session-2')).not.toBeNull();
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all session caches', async () => {
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-1');
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-2');

      tokenLogger.clearAllCaches();

      expect(tokenLogger.getSessionSummary('session-1')).toBeNull();
      expect(tokenLogger.getSessionSummary('session-2')).toBeNull();
    });
  });

  describe('static methods', () => {
    // Define interface for static methods on TokenLoggerService constructor
    interface TokenLoggerServiceStatic {
      getSupportedModels(): string[];
      getModelPricing(model: string): { input: number; output: number; provider: string } | null;
    }

    it('should return supported models', () => {
      const TokenLoggerClass = tokenLogger.constructor as unknown as TokenLoggerServiceStatic;
      const models = TokenLoggerClass.getSupportedModels();

      expect(models).toContain(OPENAI_MODEL);
      expect(models).toContain(ANTHROPIC_MODEL);
      expect(models).toContain(GOOGLE_MODEL);
    });

    it('should return model pricing', () => {
      const TokenLoggerClass = tokenLogger.constructor as unknown as TokenLoggerServiceStatic;
      const pricing = TokenLoggerClass.getModelPricing(OPENAI_MODEL);
      const metadata = getModelMetadataById(OPENAI_MODEL)!;

      expect(pricing?.input).toBe(metadata.inputCost);
      expect(pricing?.output).toBe(metadata.outputCost);
      expect(pricing?.provider).toBe('openai');
    });

    it('should return null for unknown model pricing', () => {
      const TokenLoggerClass = tokenLogger.constructor as unknown as TokenLoggerServiceStatic;
      const pricing = TokenLoggerClass.getModelPricing('unknown-model');

      expect(pricing).toBeNull();
    });
  });

  describe('convenience function', () => {
    it('should log token usage through convenience function', async () => {
      await logTokenUsage('gpt-5.4', 100, 'user-123');

      const summary = tokenLogger.getSessionSummary('default');

      expect(summary?.totalTokens).toBe(100);
    });
  });

  describe('provider detection', () => {
    it('should detect OpenAI provider', async () => {
      await tokenLogger.logTokenUsage(OPENAI_MODEL, 100, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');
      const summary = tokenLogger.getSessionSummary('session-1');

      expect(logs?.[0]?.provider).toBe('openai');
      expect(summary?.byModel[OPENAI_MODEL]?.provider).toBe('openai');
    });

    it('should detect Anthropic provider', async () => {
      await tokenLogger.logTokenUsage(ANTHROPIC_MODEL, 100, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.provider!).toBe('anthropic');
    });

    it('should detect Google provider', async () => {
      await tokenLogger.logTokenUsage(GOOGLE_MODEL, 100, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.provider!).toBe('google');
    });

    it('should detect Perplexity provider', async () => {
      await tokenLogger.logTokenUsage(PERPLEXITY_MODEL, 100, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.provider!).toBe('perplexity');
    });

    it('should detect Grok provider', async () => {
      await tokenLogger.logTokenUsage(GROK_MODEL, 100, 'user-123', 'session-1');

      const logs = tokenLogger.getSessionLogs('session-1');

      expect(logs![0]!.provider!).toBe('grok');
    });
  });

  describe('pricing accuracy', () => {
    it('should use correct GPT-5.4 pricing', async () => {
      await tokenLogger.logTokenUsage(
        OPENAI_MODEL,
        1000000,
        'user-123',
        'session-1',
        undefined,
        undefined,
        500000, // 500K input
        500000, // 500K output
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.totalCost).toBeCloseTo(expectedCostForModel(OPENAI_MODEL, 500000, 500000), 2);
    });

    it('should use correct GPT-5.4-mini pricing', async () => {
      await tokenLogger.logTokenUsage(
        'gpt-5.4-mini',
        1000000,
        'user-123',
        'session-1',
        undefined,
        undefined,
        500000,
        500000,
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.totalCost).toBeCloseTo(
        expectedCostForModel('gpt-5.4-mini', 500000, 500000),
        3,
      );
    });

    it('should use correct Claude Haiku pricing', async () => {
      await tokenLogger.logTokenUsage(
        CLAUDE_HAIKU_MODEL,
        1000000,
        'user-123',
        'session-1',
        undefined,
        undefined,
        500000,
        500000,
      );

      const summary = tokenLogger.getSessionSummary('session-1');

      expect(summary?.totalCost).toBeCloseTo(
        expectedCostForModel(CLAUDE_HAIKU_MODEL, 500000, 500000),
        2,
      );
    });
  });

  describe('error handling', () => {
    it('should warn on token mismatch', async () => {
      const warnSpy = vi.spyOn(console, 'warn');

      await tokenLogger.logTokenUsage(
        'gpt-5.4',
        100,
        'user-123',
        'session-1',
        undefined,
        undefined,
        20, // Input
        30, // Output - total is 50, not 100
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Token mismatch'));
    });

    it('should handle database persistence errors gracefully', async () => {
      // Get the mock from the module
      const { __getMockTrackAPICall } =
        (await import('@features/billing/services/usage-monitor')) as unknown as {
          __getMockTrackAPICall: () => ReturnType<typeof vi.fn>;
        };
      const mockTrackAPICall = __getMockTrackAPICall();

      // Make the mock trackAPICall reject for this test
      mockTrackAPICall.mockRejectedValueOnce(new Error('DB error'));

      const errorSpy = vi.spyOn(console, 'error');

      // Should not throw
      await tokenLogger.logTokenUsage('gpt-5.4', 100, 'user-123', 'session-db-error');

      // In-memory tracking should still work
      const summary = tokenLogger.getSessionSummary('session-db-error');
      expect(summary?.totalTokens).toBe(100);

      // Error should have been logged
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TokenLogger] Failed to persist to database:'),
        expect.any(Error),
      );
    });
  });
});
