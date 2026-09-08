import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { runCloudCodeAgentTurn, type CloudCodeToolRunner } from '../cloud-code-agent-loop';
import {
  isCloudCodeTurnCancellationRequested,
  requestCloudCodeTurnCancellation,
} from '../cloud-code-agent-service';
import { CloudCodeConflictError } from '../cloud-code-session-service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = { userId: 'user-1', organizationId: null };

function streamOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function adapterYielding(turns: StreamChunk[][]): ProviderAdapter {
  let index = 0;
  return {
    id: 'test-provider',
    stream: vi.fn(() => streamOf(turns[Math.min(index++, turns.length - 1)] ?? [])),
  } as unknown as ProviderAdapter;
}

function toolCallChunks(ids: string[]): StreamChunk[] {
  return ids.flatMap((id) => [
    { type: 'tool-use-start', toolUseId: id, name: 'run_command' },
    { type: 'tool-use-delta', toolUseId: id, deltaJson: JSON.stringify({ command: 'ls' }) },
    { type: 'tool-use-end', toolUseId: id },
  ]) as StreamChunk[];
}

function runner(): CloudCodeToolRunner {
  return {
    readFile: vi.fn(async () => ({ output: '', isError: false })),
    listFiles: vi.fn(async () => ({ output: '', isError: false })),
    runCommand: vi.fn(async () => ({ output: 'ran', isError: false })),
    runSharedExecutionTool: vi.fn(async () => ({ output: '', isError: false })),
  };
}

describe('the agent loop observes a stop it was never signalled about', () => {
  it('stops between steps without starting the next provider call', async () => {
    const adapter = adapterYielding([toolCallChunks(['call-1'])]);
    let cancelled = false;

    const result = await runCloudCodeAgentTurn({
      adapter,
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      isCancelled: () => cancelled,
      onEvent: async () => {
        cancelled = true;
      },
    });

    expect(result.stopReason).toBe('cancelled');
    expect(adapter.stream).toHaveBeenCalledTimes(1);
  });

  it('stops between the tool calls of one step, leaving the rest unrun', async () => {
    const toolRunner = runner();
    let cancelled = false;

    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([toolCallChunks(['call-1', 'call-2', 'call-3'])]),
      model: 'test-model',
      goal: 'do the thing',
      runner: toolRunner,
      signal: new AbortController().signal,
      isCancelled: () => cancelled,
      onEvent: async (event) => {
        if (event.type === 'tool-end') cancelled = true;
      },
    });

    expect(result.stopReason).toBe('cancelled');
    expect(toolRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it('runs to completion when no stop was asked for', async () => {
    const result = await runCloudCodeAgentTurn({
      adapter: adapterYielding([[{ type: 'text-delta', delta: 'all done' } as StreamChunk]]),
      model: 'test-model',
      goal: 'do the thing',
      runner: runner(),
      signal: new AbortController().signal,
      isCancelled: () => false,
    });

    expect(result.stopReason).toBe('done');
    expect(result.finalMessage).toBe('all done');
  });
});

function runRow() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'user-1',
    request_id: 'turn-key-12345678',
    conversation_id: null,
    origin_surface: 'web',
    work_mode: 'agiwork',
    state: 'running',
    provider: 'anthropic',
    model: 'a-model',
    last_event_sequence: -1,
    cancellation_requested_at: '2026-09-07T20:00:00.000Z',
    completed_at: null,
    created_at: '2026-09-07T19:00:00.000Z',
    updated_at: '2026-09-07T20:00:00.000Z',
  };
}

describe('requestCloudCodeTurnCancellation', () => {
  let queries: { sql: string; params: unknown[] }[] = [];

  function db(rows: Record<string, unknown>[]) {
    return {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        // The stop mirror looks for a durable run by the turn's key; these
        // cases are all inline turns, which have none.
        if (/from public\.cloud_agent_runs/.test(sql)) return [];
        return rows;
      }),
    };
  }

  beforeEach(() => {
    queries = [];
  });

  it('records the stop against the running turn of the session', async () => {
    const result = await requestCloudCodeTurnCancellation(
      db([
        {
          id: TURN_ID,
          idempotency_key: 'turn-key-12345678',
          cancel_requested_at: '2026-09-07T20:00:00.000Z',
        },
      ]) as never,
      OWNER,
      SESSION_ID,
    );

    expect(result).toEqual({
      turnId: TURN_ID,
      requestedAt: '2026-09-07T20:00:00.000Z',
      durable: false,
    });
    expect(queries[0]?.sql).toContain('cancel_requested_at = coalesce(cancel_requested_at, now())');
    expect(queries[0]?.sql).toContain('user_id = $2');
    expect(queries[0]?.params).toEqual([
      SESSION_ID,
      'user-1',
      null,
      ['running', 'awaiting_approval'],
      null,
    ]);
  });

  it('keeps the first request time when stop is pressed twice', async () => {
    await requestCloudCodeTurnCancellation(
      db([{ id: TURN_ID, cancel_requested_at: '2026-09-07T20:00:00.000Z' }]) as never,
      OWNER,
      SESSION_ID,
    );
    expect(queries[0]?.sql).not.toContain('cancel_requested_at = now()');
  });

  it('mirrors the stop onto the durable run that is carrying the turn', async () => {
    const adapter = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (/public\.cloud_agent_runs/.test(sql)) return [runRow()];
        return [
          {
            id: TURN_ID,
            idempotency_key: 'turn-key-12345678',
            cancel_requested_at: '2026-09-07T20:00:00.000Z',
          },
        ];
      }),
    };

    const result = await requestCloudCodeTurnCancellation(adapter as never, OWNER, SESSION_ID);

    expect(result.durable).toBe(true);
    expect(queries.some((call) => /update public\.cloud_agent_runs/.test(call.sql))).toBe(true);
  });

  it('refuses when nothing is running', async () => {
    await expect(
      requestCloudCodeTurnCancellation(db([]) as never, OWNER, SESSION_ID),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });

  it('scopes the read of the request to the turn and its owner', async () => {
    await expect(
      isCloudCodeTurnCancellationRequested(
        db([{ cancel_requested_at: '2026-09-07T20:00:00.000Z' }]) as never,
        OWNER,
        TURN_ID,
      ),
    ).resolves.toBe(true);
    expect(queries[0]?.sql).toContain('id = $1 and user_id = $2');
    expect(queries[0]?.params).toEqual([TURN_ID, 'user-1', null]);
  });

  it('reads no request as no stop', async () => {
    await expect(
      isCloudCodeTurnCancellationRequested(
        db([{ cancel_requested_at: null }]) as never,
        OWNER,
        TURN_ID,
      ),
    ).resolves.toBe(false);
  });
});
