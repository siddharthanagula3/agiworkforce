import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toolInvocationIdempotencyKey } from '@agiworkforce/provider-runtime';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const store = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => store.value,
}));

import {
  alreadySettledMessage,
  resolveToolIdempotencyWindowMs,
  runToolCallOnce,
  TOOL_IDEMPOTENCY_WINDOW_ENV,
} from './tool-idempotency';

const REQUEST_KEY = 'agi.chat.web.send.assistant-001';
const TOOL_NAME = 'connector__send_email';

function memoryStore() {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      entries.set(key, value);
      return true;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.value = memoryStore();
  delete process.env[TOOL_IDEMPOTENCY_WINDOW_ENV];
});

function key(step: number, toolCallId = 'call_1'): string {
  return toolInvocationIdempotencyKey({ requestKey: REQUEST_KEY, step, toolCallId });
}

describe('a retried step does not run a mutating tool twice', () => {
  it('replays the settled result instead of executing again', async () => {
    const execute = vi.fn(async () => ({ content: 'sent', isError: false }));
    const execution = {
      idempotencyKey: key(0),
      retrySafety: 'unsafe' as const,
      toolName: TOOL_NAME,
      execute,
    };

    const first = await runToolCallOnce(execution);
    const retried = await runToolCallOnce(execution);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(retried).toEqual(first);
  });

  it('reports settlement without inventing a result when the result was too large to store', async () => {
    const oversized = { content: 'x'.repeat(32 * 1024), isError: false };
    const execute = vi.fn(async () => oversized);
    const execution = {
      idempotencyKey: key(0),
      retrySafety: 'unsafe' as const,
      toolName: TOOL_NAME,
      execute,
    };

    await runToolCallOnce(execution);
    const retried = await runToolCallOnce(execution);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(retried).toEqual({ content: alreadySettledMessage(TOOL_NAME), isError: false });
  });

  it('lets a different step run the same tool call id', async () => {
    const execute = vi.fn(async () => ({ content: 'sent', isError: false }));

    await runToolCallOnce({
      idempotencyKey: key(0),
      retrySafety: 'unsafe',
      toolName: TOOL_NAME,
      execute,
    });
    await runToolCallOnce({
      idempotencyKey: key(1),
      retrySafety: 'unsafe',
      toolName: TOOL_NAME,
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('never blocks a read-only tool, whose second run costs nothing', async () => {
    const execute = vi.fn(async () => ({ content: 'results', isError: false }));
    const execution = {
      idempotencyKey: key(0),
      retrySafety: 'safe' as const,
      toolName: 'web_search',
      execute,
    };

    await runToolCallOnce(execution);
    await runToolCallOnce(execution);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not settle a call that paused for input, so the resume can finish it', async () => {
    const execute = vi.fn(async () => ({
      content: 'waiting',
      isError: false,
      inputRequired: { inputRequests: [] } as never,
    }));
    const execution = {
      idempotencyKey: key(0),
      retrySafety: 'unsafe' as const,
      toolName: TOOL_NAME,
      execute,
    };

    await runToolCallOnce(execution);
    await runToolCallOnce(execution);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('runs the tool rather than failing the turn when the store is unreachable', async () => {
    store.value = null;
    const execute = vi.fn(async () => ({ content: 'sent', isError: false }));
    const execution = {
      idempotencyKey: key(0),
      retrySafety: 'unsafe' as const,
      toolName: TOOL_NAME,
      execute,
    };

    await expect(runToolCallOnce(execution)).resolves.toEqual({ content: 'sent', isError: false });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('the settlement window', () => {
  it('defaults when nothing is configured', () => {
    expect(resolveToolIdempotencyWindowMs({})).toBe(15 * 60_000);
  });

  it('reads its documented env name', () => {
    expect(resolveToolIdempotencyWindowMs({ [TOOL_IDEMPOTENCY_WINDOW_ENV]: '60000' })).toBe(60_000);
  });

  it('keeps the default rather than disabling the guard on an unparseable value', () => {
    expect(resolveToolIdempotencyWindowMs({ [TOOL_IDEMPOTENCY_WINDOW_ENV]: 'never' })).toBe(
      15 * 60_000,
    );
  });
});
