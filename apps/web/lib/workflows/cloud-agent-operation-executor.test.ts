import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FatalError, RetryableError } from 'workflow';

vi.mock('server-only', () => ({}));

const receiptMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  claimCloudAgentExecutionOperation: receiptMocks.claim,
  completeCloudAgentExecutionOperation: receiptMocks.complete,
  failCloudAgentExecutionOperation: receiptMocks.fail,
  fingerprintCloudAgentOperation: () => 'a'.repeat(64),
}));

import { executeCloudAgentOperation } from './cloud-agent-operation-executor';

const db = {} as never;
const ResultSchema = z.object({ answer: z.number() }).strict();

describe('durable cloud agent operation executor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a newly acquired result with billing-scoped usage', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: '0190a000-0000-7000-8000-000000000002',
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      attempt: 1,
    });
    receiptMocks.complete.mockResolvedValue({ status: 'completed' });
    const execute = vi.fn().mockResolvedValue({ answer: 42 });

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'provider:1',
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: { model: 'test' },
        resultSchema: ResultSchema,
        execute,
        usage: () => ({ inputTokens: 10, outputTokens: 2 }),
      }),
    ).resolves.toEqual({ answer: 42 });

    expect(receiptMocks.complete).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        result: { answer: 42 },
        usage: {
          billingIdempotencyKey: 'agi.chat.web.request-1',
          inputTokens: 10,
          outputTokens: 2,
        },
      }),
    );
  });

  it('replays a completed result without repeating the operation', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'completed',
      result: { answer: 7 },
      usage: null,
    });
    const execute = vi.fn();

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'provider:1',
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: { model: 'test' },
        resultSchema: ResultSchema,
        execute,
      }),
    ).resolves.toEqual({ answer: 7 });
    expect(execute).not.toHaveBeenCalled();
  });

  it('signals a retry while another workflow step owns the receipt', async () => {
    receiptMocks.claim.mockResolvedValue({ disposition: 'in_progress' });

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'tool:call-1',
        operationKind: 'tool',
        retrySafety: 'unsafe',
        payload: {},
        resultSchema: ResultSchema,
        execute: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(RetryableError);
  });

  it('ends the run terminal once the replay attempt cap has failed the operation closed', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'failed',
      error: { code: 'operation_replay_limit_exceeded', message: 'exceeded' },
    });

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'tool:call-1',
        operationKind: 'tool',
        retrySafety: 'safe',
        payload: {},
        resultSchema: ResultSchema,
        execute: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(FatalError);
  });

  it('fails closed when an unsafe operation outcome cannot be proven', async () => {
    receiptMocks.claim.mockResolvedValue({ disposition: 'outcome_unknown' });

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'provider:1',
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: {},
        resultSchema: ResultSchema,
        execute: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(FatalError);
  });

  it('leaves the lease active when the external result cannot be durably recorded', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: '0190a000-0000-7000-8000-000000000002',
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      attempt: 1,
    });
    receiptMocks.complete.mockRejectedValue(new Error('database unavailable'));

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'provider:1',
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: {},
        resultSchema: ResultSchema,
        execute: vi.fn().mockResolvedValue({ answer: 42 }),
      }),
    ).rejects.toThrow('database unavailable');
    expect(receiptMocks.fail).not.toHaveBeenCalled();
  });

  it('replaces a raw provider JSON error body with a summary before recording or rethrowing it', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: '0190a000-0000-7000-8000-000000000002',
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      attempt: 1,
    });
    receiptMocks.fail.mockResolvedValue(undefined);
    const rawProviderError = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"bad request"}}',
    );

    const rejection = await executeCloudAgentOperation(db, {
      userId: 'user-1',
      runId: '0190a000-0000-7000-8000-000000000001',
      billingIdempotencyKey: 'agi.chat.web.request-1',
      operationKey: 'provider:1',
      operationKind: 'provider',
      retrySafety: 'unsafe',
      payload: {},
      resultSchema: ResultSchema,
      execute: vi.fn().mockRejectedValue(rawProviderError),
    }).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).not.toContain('"type":"error"');
    expect((rejection as Error).cause).toBe(rawProviderError);
    expect(receiptMocks.fail).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        error: expect.objectContaining({
          message: (rejection as Error).message,
        }),
      }),
    );
  });

  it('replaces a raw Zod issues array error message the same way', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: '0190a000-0000-7000-8000-000000000002',
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      attempt: 1,
    });
    receiptMocks.fail.mockResolvedValue(undefined);

    const rejection = await executeCloudAgentOperation(db, {
      userId: 'user-1',
      runId: '0190a000-0000-7000-8000-000000000001',
      billingIdempotencyKey: 'agi.chat.web.request-1',
      operationKey: 'provider:1',
      operationKind: 'provider',
      retrySafety: 'unsafe',
      payload: {},
      resultSchema: ResultSchema,
      execute: vi.fn().mockResolvedValue({ answer: 'not-a-number' }),
    }).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message.startsWith('[')).toBe(false);
  });

  it('keeps a human-authored failure message unchanged', async () => {
    receiptMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: '0190a000-0000-7000-8000-000000000002',
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      attempt: 1,
    });
    receiptMocks.fail.mockResolvedValue(undefined);

    await expect(
      executeCloudAgentOperation(db, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.request-1',
        operationKey: 'provider:1',
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: {},
        resultSchema: ResultSchema,
        execute: vi.fn().mockRejectedValue(new Error('Model is overloaded')),
      }),
    ).rejects.toThrow('Model is overloaded');
    expect(receiptMocks.fail).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Model is overloaded' }),
      }),
    );
  });
});
