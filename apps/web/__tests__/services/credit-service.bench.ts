import { bench, describe, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase with configurable latency
let simulatedLatencyMs = 0;

const mockRpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => {
  // Simulate database latency for realistic benchmarks
  if (simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
  }
  return {
    data: {
      success: true,
      account_id: 'acc_bench_123',
      remaining_cents: 4900,
    },
    error: null,
  };
});

const mockSupabaseClient = {
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import after mocks
import { CreditService } from '@/lib/services/credit-service';

/**
 * Performance benchmarks for CreditService
 *
 * Run with: pnpm vitest bench
 *
 * These benchmarks measure:
 * - Throughput: operations per second
 * - Latency: time per operation
 * - Overhead: service layer cost without DB latency
 */

describe('CreditService Performance Benchmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simulatedLatencyMs = 0;
  });

  describe('Zero-latency (service overhead only)', () => {
    bench(
      'getDailyLimit - synchronous calculation',
      () => {
        CreditService.getDailyLimit(10000);
      },
      { iterations: 10000, warmupIterations: 100 },
    );

    bench(
      'generateIdempotencyKey - string generation',
      () => {
        CreditService.generateIdempotencyKey('user-123', 'reservation', 'req-abc-123');
      },
      { iterations: 10000, warmupIterations: 100 },
    );

    bench(
      'deductCredits - async overhead (no DB latency)',
      async () => {
        await CreditService.deductCredits('user-123', 100, 'benchmark test', { provider: 'test' });
      },
      { iterations: 1000, warmupIterations: 50 },
    );

    bench(
      'getBalance - async overhead (no DB latency)',
      async () => {
        mockRpc.mockResolvedValueOnce({
          data: [
            {
              account_id: 'acc_123',
              credits_remaining_cents: 4000,
              credits_allocated_cents: 5000,
              credits_used_cents: 1000,
              period_start: '2025-01-01',
              period_end: '2025-02-01',
            },
          ],
          error: null,
        });
        await CreditService.getBalance('user-123');
      },
      { iterations: 1000, warmupIterations: 50 },
    );

    bench(
      'checkAvailable - async overhead (no DB latency)',
      async () => {
        mockRpc.mockResolvedValueOnce({ data: true, error: null });
        await CreditService.checkAvailable('user-123', 100);
      },
      { iterations: 1000, warmupIterations: 50 },
    );
  });

  describe('Concurrent operations', () => {
    bench(
      'parallel deductCredits - 10 concurrent requests',
      async () => {
        const promises = Array.from({ length: 10 }, (_, i) =>
          CreditService.deductCredits(`user-${i}`, 100, `benchmark-${i}`),
        );
        await Promise.all(promises);
      },
      { iterations: 100, warmupIterations: 10 },
    );

    bench(
      'parallel deductCredits - 50 concurrent requests',
      async () => {
        const promises = Array.from({ length: 50 }, (_, i) =>
          CreditService.deductCredits(`user-${i}`, 100, `benchmark-${i}`),
        );
        await Promise.all(promises);
      },
      { iterations: 50, warmupIterations: 5 },
    );

    bench(
      'parallel mixed operations - 30 concurrent (10 each type)',
      async () => {
        const deducts = Array.from({ length: 10 }, (_, i) =>
          CreditService.deductCredits(`user-${i}`, 100),
        );
        const balances = Array.from({ length: 10 }, (_, i) => {
          mockRpc.mockResolvedValueOnce({
            data: [{ credits_remaining_cents: 4000 }],
            error: null,
          });
          return CreditService.getBalance(`user-${i}`);
        });
        const checks = Array.from({ length: 10 }, (_, i) => {
          mockRpc.mockResolvedValueOnce({ data: true, error: null });
          return CreditService.checkAvailable(`user-${i}`, 50);
        });
        await Promise.all([...deducts, ...balances, ...checks]);
      },
      { iterations: 50, warmupIterations: 5 },
    );
  });

  describe('Sequential operations (typical user flow)', () => {
    bench(
      'typical flow: check -> deduct -> getBalance',
      async () => {
        // Step 1: Check if credits available
        mockRpc.mockResolvedValueOnce({ data: true, error: null });
        await CreditService.checkAvailable('user-flow', 100);

        // Step 2: Deduct credits
        await CreditService.deductCredits('user-flow', 100, 'API call');

        // Step 3: Get updated balance
        mockRpc.mockResolvedValueOnce({
          data: [{ credits_remaining_cents: 4900 }],
          error: null,
        });
        await CreditService.getBalance('user-flow');
      },
      { iterations: 500, warmupIterations: 25 },
    );

    bench(
      'idempotent retry flow: deduct with key x3',
      async () => {
        const idempotencyKey = CreditService.generateIdempotencyKey(
          'user-retry',
          'reservation',
          'req-123',
        );

        // Simulate 3 retries with same idempotency key
        await CreditService.deductCredits('user-retry', 100, 'retry test', {}, idempotencyKey);
        await CreditService.deductCredits('user-retry', 100, 'retry test', {}, idempotencyKey);
        await CreditService.deductCredits('user-retry', 100, 'retry test', {}, idempotencyKey);
      },
      { iterations: 200, warmupIterations: 10 },
    );
  });

  describe('Error handling performance', () => {
    bench(
      'deductCredits - insufficient credits error',
      async () => {
        mockRpc.mockResolvedValueOnce({
          data: {
            success: false,
            code: 'MONTHLY_CREDIT_LIMIT_REACHED',
            available: 0,
            required: 100,
          },
          error: null,
        });
        await CreditService.deductCredits('user-empty', 100);
      },
      { iterations: 500, warmupIterations: 25 },
    );

    bench(
      'deductCredits - daily limit error',
      async () => {
        mockRpc.mockResolvedValueOnce({
          data: {
            success: false,
            code: 'DAILY_CREDIT_LIMIT_REACHED',
            daily_limit: 1500,
            daily_remaining: 0,
          },
          error: null,
        });
        await CreditService.deductCredits('user-daily-limit', 100);
      },
      { iterations: 500, warmupIterations: 25 },
    );

    bench(
      'deductCredits - database error recovery',
      async () => {
        mockRpc.mockResolvedValueOnce({
          data: null,
          error: { message: 'Connection timeout' },
        });
        await CreditService.deductCredits('user-error', 100);
      },
      { iterations: 500, warmupIterations: 25 },
    );
  });

  describe('Memory efficiency', () => {
    bench(
      'large metadata handling',
      async () => {
        const largeMetadata = {
          provider: 'anthropic',
          model: 'claude-opus-4-5',
          tokens: { input: 10000, output: 5000 },
          request_id: 'req_abc123xyz789',
          user_agent: 'AGIWorkforce/1.0.0 (macOS; Desktop)',
          features: Array.from({ length: 20 }, (_, i) => `feature_${i}`),
          timestamps: {
            started: new Date().toISOString(),
            completed: new Date().toISOString(),
          },
        };

        await CreditService.deductCredits('user-123', 100, 'Large metadata test', largeMetadata);
      },
      { iterations: 500, warmupIterations: 25 },
    );

    bench(
      'batch of 100 small deductions',
      async () => {
        for (let i = 0; i < 100; i++) {
          await CreditService.deductCredits(`user-batch-${i}`, 1, `micro-${i}`);
        }
      },
      { iterations: 20, warmupIterations: 2 },
    );
  });
});

/**
 * Throughput targets based on production requirements:
 *
 * - deductCredits: >1000 ops/sec (service layer)
 * - getBalance: >2000 ops/sec (service layer)
 * - checkAvailable: >2000 ops/sec (service layer)
 * - Concurrent 50 requests: <100ms total
 *
 * Note: Real-world performance depends on database latency.
 * These benchmarks measure service layer overhead only.
 */
