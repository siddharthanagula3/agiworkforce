// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params?: unknown[]) => 1),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: (sql: string, params?: unknown[]) => mocks.execute(sql, params) }),
}));

import {
  persistSemanticDecisionTraces,
  purgeExpiredSemanticDecisionTraces,
  recordSemanticDecisionTraces,
  type SemanticDecisionTrace,
} from '../trace-service';

function trace(overrides: Partial<SemanticDecisionTrace> = {}): SemanticDecisionTrace {
  return {
    decisionId: 'turn_signals:request-1',
    requestId: 'request-1',
    kind: 'turn_signals',
    mode: 'shadow',
    questionKey: 'task_family',
    baselineValue: 'general_chat',
    candidateValue: 'code_execution',
    agree: false,
    confidenceBin: 'p80_100',
    probabilityBin: null,
    fallbackReason: null,
    model: 'pinned-version',
    latencyMs: 180,
    inputTokens: 220,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('what a trace row carries', () => {
  it('writes bounded labels and nothing that identifies a subject', async () => {
    await recordSemanticDecisionTraces([trace()]);

    const [sql, params] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.semantic_decision_traces');
    expect(sql).toContain('on conflict (decision_id, question_key) do nothing');
    expect(sql).not.toContain('user_id');
    expect(sql).not.toContain('organization_id');
    expect(params).toEqual([
      'turn_signals:request-1',
      'request-1',
      'turn_signals',
      'shadow',
      'task_family',
      'general_chat',
      'code_execution',
      false,
      'p80_100',
      null,
      null,
      'pinned-version',
      180,
      220,
    ]);
  });

  it('drops a latency or token count that is not a count', async () => {
    await recordSemanticDecisionTraces([trace({ latencyMs: -1, inputTokens: Number.NaN })]);

    const [, params] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(params.slice(-2)).toEqual([null, null]);
  });
});

describe('persisting without holding up the turn', () => {
  it('returns before the write settles and never rejects when it fails', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('database is gone'));

    expect(() => persistSemanticDecisionTraces([trace()])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('writes one decision once, so a retried turn cannot double count', () => {
    persistSemanticDecisionTraces([trace({ decisionId: 'decision-a' })]);
    persistSemanticDecisionTraces([trace({ decisionId: 'decision-a' })]);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all for an empty batch', () => {
    persistSemanticDecisionTraces([]);

    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('retiring old rows', () => {
  it('deletes a bounded batch older than the window', async () => {
    mocks.execute.mockResolvedValueOnce(7);

    const deleted = await purgeExpiredSemanticDecisionTraces(
      { traceRetentionDays: 30, retentionBatchSize: 5_000 },
      Date.parse('2026-09-20T00:00:00.000Z'),
    );

    expect(deleted).toBe(7);
    const [sql, params] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('delete from public.semantic_decision_traces');
    expect(params).toEqual(['2026-08-21T00:00:00.000Z', 5_000]);
  });
});
