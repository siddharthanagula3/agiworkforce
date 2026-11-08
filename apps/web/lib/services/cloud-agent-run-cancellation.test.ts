import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CLOUD_AGENT_CANCELLATION_POLL_MS } from '@/lib/deadline-policy';
import { withCloudAgentRunCancellation } from './cloud-agent-run-cancellation';

vi.mock('server-only', () => ({}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const identity = { userId: 'user-cancellation-fixture', runId: 'run-cancellation-fixture' };

function input(query: ReturnType<typeof vi.fn>, controller = new AbortController()) {
  return { ...identity, db: { query } as unknown as DatabaseAdapter, controller };
}

function waiting(signal: AbortSignal) {
  return (async function* () {
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    yield* [];
  })();
}

describe('managed run streaming cancellation watcher', () => {
  it('aborts the provider signal using a query scoped to the exact run and user', async () => {
    const query = vi.fn(async () => [{ cancellation_requested: true }]);
    const scope = input(query);
    const reading = withCloudAgentRunCancellation(waiting(scope.controller.signal), scope).next();
    try {
      await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS);
      expect(query).toHaveBeenCalledWith(expect.any(String), [identity.runId, identity.userId]);
      expect(scope.controller.signal.aborted).toBe(true);
      await reading;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      scope.controller.abort();
      await reading;
    }
  });

  it('does not overlap slow reads or abort a settled producer from a late result', async () => {
    let reply!: (value: Array<{ cancellation_requested: boolean }>) => void;
    let finish!: () => void;
    const query = vi.fn(
      () =>
        new Promise<Array<{ cancellation_requested: boolean }>>((resolve) => {
          reply = resolve;
        }),
    );
    const scope = input(query);
    const generator = (async function* () {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      yield* [];
    })();
    const reading = withCloudAgentRunCancellation(generator, scope).next();
    try {
      await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS * 5);
      expect(query).toHaveBeenCalledTimes(1);
      finish();
      await reading;
      reply([{ cancellation_requested: true }]);
      await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS * 5);
      expect(scope.controller.signal.aborted).toBe(false);
      expect(query).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finish();
      reply?.([{ cancellation_requested: false }]);
      await reading;
    }
  });

  it('clears its poll when a provider throws', async () => {
    const query = vi.fn();
    const generator = (async function* () {
      yield await Promise.reject(new Error('provider unavailable'));
    })();
    await expect(withCloudAgentRunCancellation(generator, input(query)).next()).rejects.toThrow(
      'provider unavailable',
    );
    await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS * 5);
    expect(query).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its poll when an active generator is closed by its consumer', async () => {
    const query = vi.fn();
    const generator = (async function* () {
      yield 'first';
      yield 'unused';
    })();
    const wrapped = withCloudAgentRunCancellation(generator, input(query));
    expect(await wrapped.next()).toEqual({ value: 'first', done: false });
    await wrapped.return(undefined);
    await vi.advanceTimersByTimeAsync(CLOUD_AGENT_CANCELLATION_POLL_MS * 5);
    expect(query).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
