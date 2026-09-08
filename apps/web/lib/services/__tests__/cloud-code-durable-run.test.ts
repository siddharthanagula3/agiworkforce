import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateRun, mockRequestCancellation, mockIsCancellationRequested } = vi.hoisted(() => ({
  mockCreateRun: vi.fn(),
  mockRequestCancellation: vi.fn(),
  mockIsCancellationRequested: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../cloud-agent-run-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cloud-agent-run-service')>();
  return {
    ...actual,
    createCloudAgentRun: mockCreateRun,
    requestCloudAgentRunCancellation: mockRequestCancellation,
    isCloudAgentRunCancellationRequested: mockIsCancellationRequested,
  };
});

import {
  CLOUD_CODE_RUN_ORIGIN_SURFACE,
  CLOUD_CODE_RUN_WORK_MODE,
  findCloudCodeDurableRunId,
  isCloudCodeDurableStopRequested,
  mirrorCloudCodeStopOntoDurableRun,
  openCloudCodeDurableRun,
} from '../cloud-code-durable-run';

const OWNER = { userId: 'user-1', organizationId: null };
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = 'turn-key-12345678';

let queries: { sql: string; params: unknown[] }[] = [];

function db(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return rows;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  mockCreateRun.mockResolvedValue({ id: RUN_ID });
  mockRequestCancellation.mockResolvedValue({ id: RUN_ID });
  mockIsCancellationRequested.mockResolvedValue(false);
});

describe('opening the durable run for a Code turn', () => {
  it('uses the turn idempotency key as the run request id, so no column joins them', async () => {
    await expect(
      openCloudCodeDurableRun(db() as never, OWNER, {
        turnId: TURN_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        provider: 'anthropic',
        model: 'a-model',
      }),
    ).resolves.toEqual({ runId: RUN_ID });

    expect(mockCreateRun).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      requestId: IDEMPOTENCY_KEY,
      originSurface: CLOUD_CODE_RUN_ORIGIN_SURFACE,
      workMode: CLOUD_CODE_RUN_WORK_MODE,
      provider: 'anthropic',
      model: 'a-model',
    });
  });

  it('opens no conversation, because a Code turn has none', async () => {
    await openCloudCodeDurableRun(db() as never, OWNER, {
      turnId: TURN_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      provider: 'anthropic',
      model: 'a-model',
    });
    expect(mockCreateRun.mock.calls[0]?.[1]).not.toHaveProperty('conversationId');
  });

  it('finds the run again by the same key, scoped to the caller', async () => {
    await expect(
      findCloudCodeDurableRunId(db([{ id: RUN_ID }]) as never, OWNER, IDEMPOTENCY_KEY),
    ).resolves.toBe(RUN_ID);
    expect(queries[0]?.sql).toContain('user_id = $1 and request_id = $2');
    expect(queries[0]?.params).toEqual(['user-1', IDEMPOTENCY_KEY]);
  });

  it('answers null when the turn never ran durably', async () => {
    await expect(
      findCloudCodeDurableRunId(db([]) as never, OWNER, IDEMPOTENCY_KEY),
    ).resolves.toBeNull();
  });
});

describe('one stop button, whichever transport carries the turn', () => {
  it('mirrors the stop onto the run when there is one', async () => {
    await expect(
      mirrorCloudCodeStopOntoDurableRun(db([{ id: RUN_ID }]) as never, OWNER, IDEMPOTENCY_KEY),
    ).resolves.toBe(true);
    expect(mockRequestCancellation).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      runId: RUN_ID,
    });
  });

  it('does nothing and says so when the turn is running inline', async () => {
    await expect(
      mirrorCloudCodeStopOntoDurableRun(db([]) as never, OWNER, IDEMPOTENCY_KEY),
    ).resolves.toBe(false);
    expect(mockRequestCancellation).not.toHaveBeenCalled();
  });

  it('honours a stop recorded on either side', async () => {
    mockIsCancellationRequested.mockResolvedValue(true);
    await expect(
      isCloudCodeDurableStopRequested(db([{ cancel_requested_at: null }]) as never, OWNER, {
        runId: RUN_ID,
        turnId: TURN_ID,
      }),
    ).resolves.toBe(true);

    mockIsCancellationRequested.mockResolvedValue(false);
    await expect(
      isCloudCodeDurableStopRequested(
        db([{ cancel_requested_at: '2026-09-08T00:00:00.000Z' }]) as never,
        OWNER,
        { runId: RUN_ID, turnId: TURN_ID },
      ),
    ).resolves.toBe(true);
  });

  it('reads no stop when neither side has one', async () => {
    await expect(
      isCloudCodeDurableStopRequested(db([{ cancel_requested_at: null }]) as never, OWNER, {
        runId: RUN_ID,
        turnId: TURN_ID,
      }),
    ).resolves.toBe(false);
  });

  it('scopes the turn side of that read to its owner', async () => {
    await isCloudCodeDurableStopRequested(db([{ cancel_requested_at: null }]) as never, OWNER, {
      runId: RUN_ID,
      turnId: TURN_ID,
    });
    const read = queries.find((call) => /cloud_code_agent_turns/.test(call.sql));
    expect(read?.sql).toContain('id = $1 and user_id = $2');
    expect(read?.params).toEqual([TURN_ID, 'user-1', null]);
  });
});
