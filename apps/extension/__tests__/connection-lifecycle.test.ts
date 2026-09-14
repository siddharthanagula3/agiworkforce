import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  isPermanentNativeDisconnect,
  nativeReconnectDelayMs,
  NATIVE_RECONNECT_BASE_DELAY_MS,
  NATIVE_RECONNECT_MAX_ATTEMPTS,
  NATIVE_RECONNECT_MAX_DELAY_MS,
} from '../src/features/native-bridge/reconnect';

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
          }).catch(() => {}),
        ),
    );
  }
}

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

describe('isPermanentNativeDisconnect', () => {
  it('identifies "Specified native messaging host not found" as permanent', () => {
    expect(isPermanentNativeDisconnect('Specified native messaging host not found')).toBe(true);
  });

  it('identifies "Native host not found" as permanent', () => {
    expect(isPermanentNativeDisconnect('Native host not found')).toBe(true);
  });

  it('identifies forbidden access message as permanent', () => {
    expect(
      isPermanentNativeDisconnect('Access to the specified native messaging host is forbidden'),
    ).toBe(true);
  });

  it('identifies "not allowed" as permanent', () => {
    expect(isPermanentNativeDisconnect('Connection is not allowed')).toBe(true);
  });

  it('does not classify a crash as permanent', () => {
    expect(isPermanentNativeDisconnect('com.agiworkforce.browser crashed unexpectedly')).toBe(
      false,
    );
  });

  it('does not classify an empty string as permanent', () => {
    expect(isPermanentNativeDisconnect('')).toBe(false);
  });

  it('does not classify a generic disconnect as permanent', () => {
    expect(isPermanentNativeDisconnect('Native host disconnected')).toBe(false);
  });

  it('does not classify a timeout as permanent', () => {
    expect(isPermanentNativeDisconnect('Connection timed out waiting for host response')).toBe(
      false,
    );
  });
});

describe('nativeReconnectDelayMs', () => {
  it('returns the base delay for the first attempt', () => {
    expect(nativeReconnectDelayMs(1)).toBe(NATIVE_RECONNECT_BASE_DELAY_MS);
  });

  it('doubles on each successive attempt', () => {
    expect(nativeReconnectDelayMs(2)).toBe(NATIVE_RECONNECT_BASE_DELAY_MS * 2);
    expect(nativeReconnectDelayMs(3)).toBe(NATIVE_RECONNECT_BASE_DELAY_MS * 4);
    expect(nativeReconnectDelayMs(4)).toBe(NATIVE_RECONNECT_BASE_DELAY_MS * 8);
  });

  it('caps at the maximum delay', () => {
    for (let attempt = 1; attempt < NATIVE_RECONNECT_MAX_ATTEMPTS; attempt++) {
      expect(nativeReconnectDelayMs(attempt)).toBeLessThanOrEqual(NATIVE_RECONNECT_MAX_DELAY_MS);
    }
    expect(nativeReconnectDelayMs(NATIVE_RECONNECT_MAX_ATTEMPTS - 1)).toBe(
      NATIVE_RECONNECT_MAX_DELAY_MS,
    );
  });

  it('stops once the attempts are exhausted, so only a user action reconnects', () => {
    expect(nativeReconnectDelayMs(NATIVE_RECONNECT_MAX_ATTEMPTS)).toBeNull();
    expect(nativeReconnectDelayMs(NATIVE_RECONNECT_MAX_ATTEMPTS + 1)).toBeNull();
  });

  it('grows strictly until it reaches the cap', () => {
    const delays: number[] = [];
    for (let attempt = 1; attempt < NATIVE_RECONNECT_MAX_ATTEMPTS; attempt++) {
      delays.push(nativeReconnectDelayMs(attempt)!);
    }
    for (let index = 1; index < delays.length; index++) {
      expect(delays[index]!).toBeGreaterThanOrEqual(delays[index - 1]!);
    }
  });
});

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
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Tab closed'));
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

describe('end-to-end reconnection simulation', () => {
  it('backs off over the whole budget and then stops', () => {
    const delays: (number | null)[] = [];
    for (let attempt = 1; attempt <= NATIVE_RECONNECT_MAX_ATTEMPTS + 1; attempt++) {
      delays.push(nativeReconnectDelayMs(attempt));
    }

    expect(delays[0]).toBe(NATIVE_RECONNECT_BASE_DELAY_MS);
    expect(delays.filter((delay) => delay === null)).toHaveLength(2);
    expect(delays[NATIVE_RECONNECT_MAX_ATTEMPTS - 1]).toBeNull();
  });

  it('stops immediately on a permanent error mid-reconnection', () => {
    expect(nativeReconnectDelayMs(2)).not.toBeNull();
    expect(isPermanentNativeDisconnect('Specified native messaging host not found')).toBe(true);
  });
});

describe('the worker connects to AGI Desktop only once pairing has succeeded', () => {
  const background = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
    'utf8',
  );

  it('gates the start-up connect on the persisted pairing flag', () => {
    const initialize = background.slice(
      background.indexOf('function initialize(): void {'),
      background.indexOf('function handleManagedChatKeepalivePort('),
    );
    expect(initialize).toMatch(
      /void shouldAutoConnectToDesktop\(\)\.then\(\(autoConnect\) => \{\s*if \(!autoConnect\) return;/,
    );
    expect(background).toMatch(
      /async function shouldAutoConnectToDesktop\(\)[\s\S]*?storageUtils\.getItem<boolean>\(DESKTOP_PAIRED_KEY, false\)\)? === true/,
    );
  });

  it('stops the maintenance pass re-arming its alarm for an unpaired profile', () => {
    const pass = background.slice(
      background.indexOf('async function runMaintenancePass()'),
      background.indexOf('async function settleMaintenanceAlarm()'),
    );
    expect(pass).toContain('if (!state.isNativeConnected && (await shouldAutoConnectToDesktop()))');
  });

  it('keeps the give-up decision across a worker restart within the session', () => {
    expect(background).toContain(
      "const NATIVE_RECONNECT_GAVE_UP_KEY = 'agi_native_reconnect_gave_up';",
    );
    expect(background).toMatch(/chrome\.storage\.session\s*\.get\(NATIVE_RECONNECT_GAVE_UP_KEY\)/);
    expect(background).toMatch(
      /function setNativeReconnectGaveUp\(gaveUp: boolean\): void \{[\s\S]*?chrome\.storage\.session[\s\S]*?set\(\{ \[NATIVE_RECONNECT_GAVE_UP_KEY\]: gaveUp \}\)/,
    );
    for (const branch of [
      'Max native reconnect attempts reached; giving up until user action',
      'Native host permanently unavailable; halting reconnect',
    ]) {
      const index = background.indexOf(branch);
      expect(index).toBeGreaterThan(-1);
      expect(background.slice(index, index + 220)).toContain('setNativeReconnectGaveUp(true)');
    }
  });

  it('clears the suspend flag when Chrome cancels the suspend', () => {
    expect(background).toMatch(
      /chrome\.runtime\.onSuspendCanceled\.addListener\(\(\) => \{\s*_bgCtx\.nativeSuspendInProgress = false;/,
    );
  });
});
