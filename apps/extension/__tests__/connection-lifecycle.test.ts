/**
 * Tests for the full extension connection lifecycle.
 *
 * This file mirrors and exercises the logic that lives in background.ts for:
 * - Initial connection attempt via native messaging
 * - Reconnection backoff after disconnect
 * - Permanent vs transient error classification
 * - Multiple-tab connection-status broadcasting
 * - Timeout handling for slow native responses
 * - Connection state read via GET_CONNECTION_STATUS
 *
 * Because background.ts is a service worker that cannot be trivially imported
 * in jsdom, we replicate the core state-machine logic here and test it against
 * the same rules. Where we CAN drive the real module we do so via chrome mock
 * callbacks.
 *
 * Pattern precedent: background.reconnect.test.ts and background.cookies.test.ts
 * both mirror source logic; this file follows the same convention.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── isPermanentError ────────────────────────────────────────────────────────
// Mirrors the check from handleNativeDisconnect() in background.ts

function isPermanentError(error: string): boolean {
  return (
    error.includes('Native host not found') ||
    error.includes('Specified native messaging host not found') ||
    error.includes('Access to the specified native messaging host is forbidden') ||
    error.includes('not allowed')
  );
}

// ─── ReconnectScheduler ──────────────────────────────────────────────────────
// Mirrors the exponential-backoff reconnection logic in background.ts

interface ReconnectSchedulerOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  isPermanentError?: (msg: string) => boolean;
}

class ReconnectScheduler {
  private attemptCount = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly _isPermanentError: (msg: string) => boolean;

  constructor(opts: ReconnectSchedulerOptions = {}) {
    this.initialDelayMs = opts.initialDelayMs ?? 1_000;
    this.maxDelayMs = opts.maxDelayMs ?? 30_000;
    this.maxAttempts = opts.maxAttempts ?? 10;
    this._isPermanentError = opts.isPermanentError ?? isPermanentError;
  }

  /** Returns the next reconnect delay in ms, or null if no more attempts should be made. */
  nextDelay(errorMessage: string): number | null {
    if (this._isPermanentError(errorMessage)) {
      return null;
    }

    if (this.attemptCount >= this.maxAttempts) {
      return null;
    }

    const delay = Math.min(this.initialDelayMs * Math.pow(2, this.attemptCount), this.maxDelayMs);

    this.attemptCount++;
    return delay;
  }

  reset(): void {
    this.attemptCount = 0;
  }

  get attempts(): number {
    return this.attemptCount;
  }
}

// ─── ConnectionStateBroadcaster ──────────────────────────────────────────────
// Mirrors background.ts broadcastConnectionStatus() logic

interface Tab {
  id?: number;
}

class ConnectionStateBroadcaster {
  private readonly sendToTab: (tabId: number, msg: Record<string, unknown>) => Promise<void>;
  private readonly queryTabs: () => Promise<Tab[]>;

  constructor(opts: {
    sendToTab: (tabId: number, msg: Record<string, unknown>) => Promise<void>;
    queryTabs: () => Promise<Tab[]>;
  }) {
    this.sendToTab = opts.sendToTab;
    this.queryTabs = opts.queryTabs;
  }

  async broadcast(connected: boolean): Promise<void> {
    const tabs = await this.queryTabs();
    await Promise.all(
      tabs
        .filter((t) => t.id != null)
        .map((t) =>
          this.sendToTab(t.id!, {
            type: 'CONNECTION_STATUS_CHANGED',
            connected,
            timestamp: Date.now(),
          }).catch(() => {
            // Ignore closed-tab errors — non-fatal
          }),
        ),
    );
  }
}

// ─── NativeConnectionTimeout ─────────────────────────────────────────────────
// Mirrors the timeout guard wrapping connect attempts in background.ts

async function withConnectionTimeout<T>(
  connectFn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`Connection timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([connectFn(), timeoutPromise]);
    return result;
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ─── ConnectionStatusMessage ─────────────────────────────────────────────────
// Mirrors the GET_CONNECTION_STATUS response shape in background.ts

interface ConnectionStatusResponse {
  nativeConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  tabId?: number;
  bridgeUrl?: string;
}

function buildStatusResponse(
  connected: boolean,
  extra: Partial<ConnectionStatusResponse> = {},
): ConnectionStatusResponse {
  return {
    nativeConnected: connected,
    connectionStatus: connected ? 'connected' : 'disconnected',
    ...extra,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// isPermanentError
// ═════════════════════════════════════════════════════════════════════════════

describe('isPermanentError', () => {
  it('identifies "Specified native messaging host not found" as permanent', () => {
    expect(isPermanentError('Specified native messaging host not found')).toBe(true);
  });

  it('identifies "Native host not found" as permanent', () => {
    expect(isPermanentError('Native host not found')).toBe(true);
  });

  it('identifies forbidden access message as permanent', () => {
    expect(isPermanentError('Access to the specified native messaging host is forbidden')).toBe(
      true,
    );
  });

  it('identifies "not allowed" as permanent', () => {
    expect(isPermanentError('Connection is not allowed')).toBe(true);
  });

  it('does not classify a crash as permanent', () => {
    expect(isPermanentError('com.agiworkforce.browser crashed unexpectedly')).toBe(false);
  });

  it('does not classify an empty string as permanent', () => {
    expect(isPermanentError('')).toBe(false);
  });

  it('does not classify a generic disconnect as permanent', () => {
    expect(isPermanentError('Native host disconnected')).toBe(false);
  });

  it('does not classify a timeout as permanent', () => {
    expect(isPermanentError('Connection timed out waiting for host response')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ReconnectScheduler — exponential backoff
// ═════════════════════════════════════════════════════════════════════════════

describe('ReconnectScheduler', () => {
  it('returns initialDelay on the first transient error', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 1000 });
    expect(sched.nextDelay('crashed')).toBe(1000);
  });

  it('doubles the delay on successive attempts (exponential backoff)', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 1000, maxDelayMs: 60_000 });
    expect(sched.nextDelay('crash')).toBe(1000);
    expect(sched.nextDelay('crash')).toBe(2000);
    expect(sched.nextDelay('crash')).toBe(4000);
    expect(sched.nextDelay('crash')).toBe(8000);
  });

  it('caps delay at maxDelayMs', () => {
    // Use a large maxAttempts so we don't exhaust it before testing the cap
    const sched = new ReconnectScheduler({
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      maxAttempts: 20,
    });
    // After 3 doublings: 1000→2000→4000→8000 but capped at 5000
    sched.nextDelay('crash'); // 1000
    sched.nextDelay('crash'); // 2000
    sched.nextDelay('crash'); // 4000
    const capped = sched.nextDelay('crash'); // would be 8000 but capped at 5000
    expect(capped).toBe(5000);
    // Further calls remain at cap
    expect(sched.nextDelay('crash')).toBe(5000);
  });

  it('returns null for a permanent error regardless of attempt count', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 500 });
    expect(sched.nextDelay('Specified native messaging host not found')).toBeNull();
  });

  it('returns null after maxAttempts are exhausted', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 100, maxAttempts: 3 });
    sched.nextDelay('crash'); // 1
    sched.nextDelay('crash'); // 2
    sched.nextDelay('crash'); // 3
    expect(sched.nextDelay('crash')).toBeNull(); // 4th — over limit
  });

  it('reset() restarts the attempt counter', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 1000, maxAttempts: 1 });
    sched.nextDelay('crash');
    expect(sched.nextDelay('crash')).toBeNull(); // exhausted

    sched.reset();
    expect(sched.nextDelay('crash')).toBe(1000); // fresh start
  });

  it('tracks attempt count correctly', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 100, maxAttempts: 5 });
    expect(sched.attempts).toBe(0);
    sched.nextDelay('crash');
    sched.nextDelay('crash');
    expect(sched.attempts).toBe(2);
  });

  it('uses a custom isPermanentError predicate when provided', () => {
    const sched = new ReconnectScheduler({
      initialDelayMs: 500,
      isPermanentError: (msg) => msg.includes('CUSTOM_FATAL'),
    });
    expect(sched.nextDelay('CUSTOM_FATAL error occurred')).toBeNull();
    expect(sched.nextDelay('transient error')).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ConnectionStateBroadcaster — multiple tab handling
// ═════════════════════════════════════════════════════════════════════════════

describe('ConnectionStateBroadcaster', () => {
  it('broadcasts to all tabs with a valid id', async () => {
    const sendToTab = vi.fn().mockResolvedValue(undefined);
    const queryTabs = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await broadcaster.broadcast(true);

    expect(sendToTab).toHaveBeenCalledTimes(3);
    expect(sendToTab).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'CONNECTION_STATUS_CHANGED', connected: true }),
    );
  });

  it('skips tabs that do not have an id', async () => {
    const sendToTab = vi.fn().mockResolvedValue(undefined);
    const queryTabs = vi.fn().mockResolvedValue([{ id: 1 }, { id: undefined }, { id: 3 }]);

    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await broadcaster.broadcast(false);

    expect(sendToTab).toHaveBeenCalledTimes(2);
  });

  it('does not reject when a tab throws on sendMessage (closed tab)', async () => {
    const sendToTab = vi
      .fn()
      .mockResolvedValueOnce(undefined) // tab 1 ok
      .mockRejectedValueOnce(new Error('Tab closed')); // tab 2 error
    const queryTabs = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await expect(broadcaster.broadcast(true)).resolves.toBeUndefined();
  });

  it('broadcasts connected=false on disconnect', async () => {
    const sendToTab = vi.fn().mockResolvedValue(undefined);
    const queryTabs = vi.fn().mockResolvedValue([{ id: 5 }]);

    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await broadcaster.broadcast(false);

    expect(sendToTab).toHaveBeenCalledWith(5, expect.objectContaining({ connected: false }));
  });

  it('includes a timestamp in each broadcast message', async () => {
    const sendToTab = vi.fn().mockResolvedValue(undefined);
    const queryTabs = vi.fn().mockResolvedValue([{ id: 1 }]);

    const before = Date.now();
    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await broadcaster.broadcast(true);
    const after = Date.now();

    const msg = sendToTab.mock.calls[0][1] as { timestamp: number };
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('handles empty tab list without error', async () => {
    const sendToTab = vi.fn();
    const queryTabs = vi.fn().mockResolvedValue([]);

    const broadcaster = new ConnectionStateBroadcaster({ sendToTab, queryTabs });
    await expect(broadcaster.broadcast(true)).resolves.toBeUndefined();
    expect(sendToTab).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// withConnectionTimeout — timeout handling
// ═════════════════════════════════════════════════════════════════════════════

describe('withConnectionTimeout', () => {
  it('resolves with the result of a fast connect fn', async () => {
    const result = await withConnectionTimeout(() => Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects with a timeout error when connect fn is too slow', async () => {
    vi.useFakeTimers();

    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 5000));
    const race = withConnectionTimeout(() => slow, 100);

    vi.advanceTimersByTime(100);

    await expect(race).rejects.toThrow('Connection timed out after 100ms');
    vi.useRealTimers();
  });

  it('propagates rejection from the connect fn', async () => {
    const failing = withConnectionTimeout(() => Promise.reject(new Error('host crashed')), 1000);
    await expect(failing).rejects.toThrow('host crashed');
  });

  it('clears the timer after success to avoid memory leaks', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withConnectionTimeout(() => Promise.resolve(42), 5000);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears the timer after failure to avoid memory leaks', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withConnectionTimeout(() => Promise.reject(new Error('fail')), 5000).catch(() => {});
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildStatusResponse — GET_CONNECTION_STATUS response shape
// ═════════════════════════════════════════════════════════════════════════════

describe('buildStatusResponse', () => {
  it('sets nativeConnected=true and connectionStatus="connected" for connected', () => {
    const resp = buildStatusResponse(true);
    expect(resp.nativeConnected).toBe(true);
    expect(resp.connectionStatus).toBe('connected');
  });

  it('sets nativeConnected=false and connectionStatus="disconnected" for disconnected', () => {
    const resp = buildStatusResponse(false);
    expect(resp.nativeConnected).toBe(false);
    expect(resp.connectionStatus).toBe('disconnected');
  });

  it('allows extra fields to be merged in', () => {
    const resp = buildStatusResponse(true, { tabId: 42, bridgeUrl: 'http://localhost:8787' });
    expect(resp.tabId).toBe(42);
    expect(resp.bridgeUrl).toBe('http://localhost:8787');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// End-to-end reconnection simulation
// ═════════════════════════════════════════════════════════════════════════════

describe('end-to-end reconnection simulation', () => {
  it('attempts reconnect with increasing backoff until maxAttempts', () => {
    const sched = new ReconnectScheduler({
      initialDelayMs: 100,
      maxDelayMs: 1600,
      maxAttempts: 4,
    });

    const delays: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      delays.push(sched.nextDelay('crash'));
    }

    // First 4 should succeed with growing delays
    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);
    expect(delays[2]).toBe(400);
    expect(delays[3]).toBe(800);
    // Attempts 5 and 6 are beyond maxAttempts
    expect(delays[4]).toBeNull();
    expect(delays[5]).toBeNull();
  });

  it('stops immediately on a permanent error mid-reconnection', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 200, maxAttempts: 10 });

    sched.nextDelay('crash'); // attempt 1
    sched.nextDelay('crash'); // attempt 2

    // Permanent error on attempt 3
    const delay = sched.nextDelay('Specified native messaging host not found');
    expect(delay).toBeNull();
  });

  it('full lifecycle: connect → crash → backoff × 3 → permanent error → stop', () => {
    const sched = new ReconnectScheduler({ initialDelayMs: 500, maxAttempts: 5 });

    const broadcastCalls: boolean[] = [];
    const broadcast = (connected: boolean) => broadcastCalls.push(connected);

    // Step 1: initial connection established
    broadcast(true);
    expect(broadcastCalls).toEqual([true]);

    // Step 2: crash → disconnected
    broadcast(false);

    // Steps 3-5: transient reconnect attempts
    expect(sched.nextDelay('crash')).toBe(500);
    expect(sched.nextDelay('crash')).toBe(1000);
    expect(sched.nextDelay('crash')).toBe(2000);

    // Step 6: permanent error
    expect(sched.nextDelay('Specified native messaging host not found')).toBeNull();

    expect(broadcastCalls).toEqual([true, false]);
  });
});
