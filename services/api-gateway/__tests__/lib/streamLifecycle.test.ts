import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

type LifecycleModule = typeof import('../../src/lib/streamLifecycle');

interface DrainTestLifecycle {
  waitForDrain(
    writable: EventEmitter & { destroyed: boolean; writableEnded: boolean },
  ): Promise<void>;
}

async function loadLifecycleModule(): Promise<LifecycleModule | null> {
  return import('../../src/lib/streamLifecycle').catch(() => null);
}

describe('provider stream lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('owns a deadline that aborts a blocked upstream read and releases its iterator', async () => {
    vi.useFakeTimers();
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<string>>(() => undefined)),
      return: vi.fn(async () => ({ done: true, value: undefined })),
    };
    const lifecycle = lifecycleModule.createStreamLifecycle({ deadlineMs: 1_000 });
    const pendingRead = lifecycle.next(iterator);
    const rejection = expect(pendingRead).rejects.toBeInstanceOf(
      lifecycleModule.StreamDeadlineError,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(lifecycle.signal.aborted).toBe(true);

    lifecycle.release(iterator);
    lifecycle.release(iterator);
    await Promise.resolve();

    expect(iterator.return).toHaveBeenCalledTimes(1);
    lifecycle.cleanup();
  });

  it('aborts a blocked upstream read when the client disconnects', async () => {
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<string>>(() => undefined)),
      return: vi.fn(async () => ({ done: true, value: undefined })),
    };
    const lifecycle = lifecycleModule.createStreamLifecycle({ deadlineMs: 60_000 });
    const pendingRead = lifecycle.next(iterator);
    const rejection = expect(pendingRead).rejects.toBeInstanceOf(
      lifecycleModule.StreamClientAbortError,
    );

    lifecycle.abortClient();

    await rejection;
    expect(lifecycle.signal.aborted).toBe(true);

    lifecycle.release(iterator);
    await Promise.resolve();

    expect(iterator.return).toHaveBeenCalledTimes(1);
    lifecycle.cleanup();
  });

  it('does not begin the first provider read when the client has already disconnected', async () => {
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const iterator = {
      next: vi.fn(async () => ({ done: false, value: 'must-not-run' })),
      return: vi.fn(async () => ({ done: true, value: undefined })),
    };
    const lifecycle = lifecycleModule.createStreamLifecycle({ deadlineMs: 60_000 });
    const pendingRead = lifecycle.next(iterator);
    const rejection = expect(pendingRead).rejects.toBeInstanceOf(
      lifecycleModule.StreamClientAbortError,
    );

    lifecycle.abortClient();

    await rejection;
    await Promise.resolve();
    expect(iterator.next).not.toHaveBeenCalled();

    lifecycle.release(iterator);
    lifecycle.cleanup();
  });

  it('waits for drain before allowing the caller to continue', async () => {
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const lifecycle = lifecycleModule.createStreamLifecycle({
      deadlineMs: 60_000,
    }) as ReturnType<LifecycleModule['createStreamLifecycle']> & DrainTestLifecycle;
    expect(typeof lifecycle.waitForDrain).toBe('function');
    if (typeof lifecycle.waitForDrain !== 'function') {
      lifecycle.cleanup();
      return;
    }

    const writable = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
    });
    let drained = false;
    const pendingDrain = lifecycle.waitForDrain(writable).then(() => {
      drained = true;
    });

    await Promise.resolve();
    expect(drained).toBe(false);

    writable.emit('drain');
    await pendingDrain;

    expect(drained).toBe(true);
    lifecycle.cleanup();
  });

  it('uses the same deadline while waiting for response drain', async () => {
    vi.useFakeTimers();
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const lifecycle = lifecycleModule.createStreamLifecycle({
      deadlineMs: 1_000,
    }) as ReturnType<LifecycleModule['createStreamLifecycle']> & DrainTestLifecycle;
    expect(typeof lifecycle.waitForDrain).toBe('function');
    if (typeof lifecycle.waitForDrain !== 'function') {
      lifecycle.cleanup();
      return;
    }

    const writable = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
    });
    const pendingDrain = lifecycle.waitForDrain(writable);
    const rejection = expect(pendingDrain).rejects.toBeInstanceOf(
      lifecycleModule.StreamDeadlineError,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(lifecycle.signal.aborted).toBe(true);
    lifecycle.cleanup();
  });

  it('aborts through the client-disconnect path when the socket closes during drain', async () => {
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const lifecycle = lifecycleModule.createStreamLifecycle({
      deadlineMs: 60_000,
    }) as ReturnType<LifecycleModule['createStreamLifecycle']> & DrainTestLifecycle;
    expect(typeof lifecycle.waitForDrain).toBe('function');
    if (typeof lifecycle.waitForDrain !== 'function') {
      lifecycle.cleanup();
      return;
    }

    const writable = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
    });
    const pendingDrain = lifecycle.waitForDrain(writable);
    const rejection = expect(pendingDrain).rejects.toBeInstanceOf(
      lifecycleModule.StreamClientAbortError,
    );

    writable.destroyed = true;
    writable.emit('close');

    await rejection;
    expect(lifecycle.signal.aborted).toBe(true);
    lifecycle.cleanup();
  });

  it('clears the deadline during normal cleanup', async () => {
    vi.useFakeTimers();
    const lifecycleModule = await loadLifecycleModule();

    expect(lifecycleModule).not.toBeNull();
    if (!lifecycleModule) return;

    const lifecycle = lifecycleModule.createStreamLifecycle({ deadlineMs: 1_000 });
    lifecycle.cleanup();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(lifecycle.signal.aborted).toBe(false);
  });
});
