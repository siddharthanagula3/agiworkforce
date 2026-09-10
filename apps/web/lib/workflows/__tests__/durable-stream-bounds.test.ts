import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const endStalledRun = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _stalled: Record<string, unknown>) => undefined),
);
vi.mock('@/lib/services/cloud-agent-run-termination', () => ({
  endStalledCloudAgentRun: endStalledRun,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DURABLE_STREAM_DETACH_DEADLINE_MS,
  DURABLE_STREAM_SILENCE_DEADLINE_MS,
  TOOL_CALL_DEADLINE_MS,
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS,
  CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS,
} from '@/lib/deadline-policy';
import {
  boundDurableStreamLifetime,
  boundDurableTurnStream,
  DURABLE_STREAM_SILENT_CODE,
} from '../durable-stream-bounds';
import { withSseHeartbeat } from '@/app/api/llm/v1/chat/completions/lib/sse-heartbeat';

const enc = new TextEncoder();

const SILENCE_MS = 40;
const DETACH_MS = 400;
const SPEAKS_EVERY_MS = 10;

function silentAfterOpen(): {
  stream: ReadableStream<Uint8Array>;
  cancelled: () => boolean;
} {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(': durable-open\n\n'));
    },
    pull() {
      return new Promise<void>(() => undefined);
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

function speaksForever(): ReadableStream<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"."}}]}\n\n'));
          resolve();
        }, SPEAKS_EVERY_MS);
      });
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

function database(): DatabaseAdapter {
  return { query: vi.fn(), execute: vi.fn() } as unknown as DatabaseAdapter;
}

/**
 * Production, 2026-09-08 to 09: six runs claimed their opening frame and then
 * said nothing. `withSseHeartbeat` kept each response alive over a dead
 * workflow until the platform killed the function at 800 s, 1,785 times in
 * thirty days.
 */
describe('a durable stream that goes silent after the claim', () => {
  it('closes with the terminal error frame the client already reads', async () => {
    const source = silentAfterOpen();
    const out = await drain(
      boundDurableStreamLifetime(source.stream, {
        silenceMs: SILENCE_MS,
        detachMs: DETACH_MS,
        onSilence: async () => undefined,
      }),
    );

    expect(out).toContain('x_stream_error');
    expect(out).toContain(DURABLE_STREAM_SILENT_CODE);
    expect(out.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(source.cancelled()).toBe(true);
  });

  it('ends the run and cancels the world before the response closes', async () => {
    const ended: string[] = [];
    await drain(
      boundDurableStreamLifetime(silentAfterOpen().stream, {
        silenceMs: SILENCE_MS,
        detachMs: DETACH_MS,
        onSilence: async () => {
          ended.push('silence');
        },
      }),
    );

    expect(ended).toEqual(['silence']);
  });

  it('does not count the keepalives this server writes as workflow activity', async () => {
    const bounded = boundDurableStreamLifetime(silentAfterOpen().stream, {
      silenceMs: SILENCE_MS,
      detachMs: DETACH_MS,
      onSilence: async () => undefined,
    });
    const out = await drain(withSseHeartbeat(bounded, SPEAKS_EVERY_MS));

    expect(out).toContain(': keepalive');
    expect(out).toContain(DURABLE_STREAM_SILENT_CODE);
  });

  it('leaves a stream that keeps speaking alone', async () => {
    const bounded = boundDurableStreamLifetime(speaksForever(), {
      silenceMs: SILENCE_MS,
      detachMs: DETACH_MS,
      onSilence: async () => {
        throw new Error('a speaking stream must never be judged silent');
      },
    });

    const reader = bounded.getReader();
    const dec = new TextDecoder();
    let seen = '';
    while (seen.split('delta').length - 1 < 8) {
      const { value } = await reader.read();
      seen += dec.decode(value);
    }
    await reader.cancel();

    expect(seen).not.toContain(DURABLE_STREAM_SILENT_CODE);
  });
});

describe('a durable stream still working at this function budget', () => {
  it('detaches with a frame instead of riding to the platform kill', async () => {
    const detached = vi.fn(async () => undefined);
    const out = await drain(
      boundDurableStreamLifetime(speaksForever(), {
        silenceMs: SILENCE_MS * 10,
        detachMs: SILENCE_MS,
        runId: 'run-1',
        onSilence: async () => {
          throw new Error('a speaking stream must never be judged silent');
        },
        onDetach: detached,
      }),
    );

    expect(out).toContain('x_run_detached');
    expect(out).toContain('run-1');
    expect(out).not.toContain('x_stream_error');
    expect(detached).toHaveBeenCalledTimes(1);
  });
});

describe('the composition every durable entry point uses', () => {
  it('ends the run behind the stream on silence', async () => {
    endStalledRun.mockClear();
    vi.useFakeTimers();
    try {
      const collected = drain(
        boundDurableTurnStream({
          readable: silentAfterOpen().stream,
          db: database(),
          userId: 'user-1',
          runId: 'run-1',
          workflowRunId: 'wf-1',
          requestId: 'agi.chat.web.send.turn-1',
        }),
      );
      await vi.advanceTimersByTimeAsync(DURABLE_STREAM_SILENCE_DEADLINE_MS + 1);
      const out = await collected;
      expect(out).toContain(DURABLE_STREAM_SILENT_CODE);
    } finally {
      vi.useRealTimers();
    }

    expect(endStalledRun).toHaveBeenCalledTimes(1);
    expect(endStalledRun.mock.calls[0]?.[1]).toMatchObject({
      runId: 'run-1',
      userId: 'user-1',
      workflowRunId: 'wf-1',
      code: DURABLE_STREAM_SILENT_CODE,
    });
  });
});

describe('the bounds sit inside the deadline hierarchy, not beside it', () => {
  it('allows the longest legitimate gap, a whole tool call, plus a margin', () => {
    expect(DURABLE_STREAM_SILENCE_DEADLINE_MS).toBeGreaterThan(TOOL_CALL_DEADLINE_MS);
  });

  it('gives up before the step that feeds the stream would end on its own', () => {
    expect(DURABLE_STREAM_SILENCE_DEADLINE_MS).toBeLessThan(CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS);
  });

  it('detaches inside the function limit rather than at it', () => {
    expect(DURABLE_STREAM_DETACH_DEADLINE_MS).toBeLessThan(CHAT_COMPLETIONS_FUNCTION_LIMIT_MS);
    expect(DURABLE_STREAM_DETACH_DEADLINE_MS).toBeGreaterThan(DURABLE_STREAM_SILENCE_DEADLINE_MS);
  });
});
