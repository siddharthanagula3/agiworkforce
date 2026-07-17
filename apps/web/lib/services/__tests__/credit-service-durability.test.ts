import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CreditService } from '../credit-service';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function databaseWithQuery(query: ReturnType<typeof vi.fn>): DatabaseAdapter {
  return { query } as unknown as DatabaseAdapter;
}

const operation = {
  userId: 'user-123',
  amountCents: 7,
  description: 'Additional charge: openai/gpt-test',
  metadata: { requestId: 'req-123', type: 'reconciliation' },
  idempotencyKey: 'user-123:reconciliation:req-123',
};

describe('CreditService.settleCreditsDurably', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a transient database failure with the same idempotency key', async () => {
    const transient = Object.assign(new Error('connection reset by peer'), {
      code: 'ECONNRESET',
    });
    const query = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce([
        {
          status: 'succeeded',
          success: true,
          remaining_cents: 93,
          code: null,
          error: null,
          attempt_count: 1,
        },
      ]);

    const pending = CreditService.settleCreditsDurably(operation, databaseWithQuery(query));
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.status).toBe('succeeded');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual(query.mock.calls[1]?.[1]);
    expect(query.mock.calls[1]?.[1]?.[4]).toBe(operation.idempotencyKey);
  });

  it('does not retry a terminal credit decision', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        status: 'terminal',
        success: false,
        remaining_cents: 2,
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
        error: 'monthly credit limit exceeded',
        attempt_count: 1,
      },
    ]);

    const result = await CreditService.settleCreditsDurably(operation, databaseWithQuery(query));

    expect(result.status).toBe('terminal');
    expect(result.code).toBe('MONTHLY_CREDIT_LIMIT_REACHED');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails loudly after retryable transport failures exhaust the inline budget', async () => {
    const query = vi.fn().mockRejectedValue(
      Object.assign(new Error('database timeout'), {
        code: 'ETIMEDOUT',
      }),
    );

    const pending = CreditService.settleCreditsDurably(operation, databaseWithQuery(query));
    const assertion = expect(pending).rejects.toThrow('Unable to persist credit settlement');
    await vi.runAllTimersAsync();
    await assertion;

    expect(query).toHaveBeenCalledTimes(3);
    for (const call of query.mock.calls) {
      expect(call[1]?.[4]).toBe(operation.idempotencyKey);
    }
  });

  it('does not retry a non-retryable client or schema error', async () => {
    const query = vi.fn().mockRejectedValue(
      Object.assign(new Error('invalid settlement payload'), {
        status: 400,
        code: '22023',
      }),
    );

    await expect(
      CreditService.settleCreditsDurably(operation, databaseWithQuery(query)),
    ).rejects.toThrow('Unable to persist credit settlement');

    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('CreditService.processPendingSettlements', () => {
  it('bounds the batch and reports every durable outcome', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        job_id: 'job-1',
        settlement_status: 'succeeded',
        error_code: null,
        attempts: 2,
      },
      {
        job_id: 'job-2',
        settlement_status: 'pending',
        error_code: '40001',
        attempts: 3,
      },
      {
        job_id: 'job-3',
        settlement_status: 'terminal',
        error_code: 'RETRY_EXHAUSTED',
        attempts: 12,
      },
    ]);

    await expect(
      CreditService.processPendingSettlements(5_000, databaseWithQuery(query)),
    ).resolves.toEqual({ processed: 3, succeeded: 1, pending: 1, terminal: 1 });
    expect(query).toHaveBeenCalledWith('select * from process_credit_settlement_queue($1)', [500]);
  });

  it('rejects unknown database statuses instead of hiding schema drift', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        job_id: 'job-1',
        settlement_status: 'mystery',
        error_code: null,
        attempts: 1,
      },
    ]);

    await expect(
      CreditService.processPendingSettlements(0, databaseWithQuery(query)),
    ).rejects.toThrow('Unexpected credit settlement status: mystery');
    expect(query).toHaveBeenCalledWith('select * from process_credit_settlement_queue($1)', [1]);
  });
});
