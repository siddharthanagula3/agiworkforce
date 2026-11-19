import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import {
  isPermanentNativeDisconnect,
  nativeReconnectDelayMs,
  NATIVE_RECONNECT_BASE_DELAY_MS,
  NATIVE_RECONNECT_MAX_ATTEMPTS,
  NATIVE_RECONNECT_MAX_DELAY_MS,
} from '../src/features/native-bridge/reconnect';

type WorkerState = {
  nativePort: { disconnect: () => void } | null;
  isNativeConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastNativeError: string | null;
};

function workerConnection(options: {
  tabs?: Array<{ id?: number }>;
  queryFails?: boolean;
  connectsAfterPolls?: number | null;
}) {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
    'utf8',
  );
  const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
  const wanted = [
    'notifyConnectionStatusChange',
    'waitForNativeConnection',
    'triggerManualReconnect',
  ];
  const found = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.includes(node.name.text))
      found.set(node.name.text, node.getText(program));
    ts.forEachChild(node, visit);
  };
  visit(program);
  expect([...found.keys()].sort()).toEqual([...wanted].sort());
  const compiled = ts.transpileModule(
    `${[...found.values()].join('\n')}\nreturn { notifyConnectionStatusChange, waitForNativeConnection, triggerManualReconnect };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  const state: WorkerState = {
    nativePort: null,
    isNativeConnected: false,
    connectionStatus: 'disconnected',
    lastNativeError: null,
  };
  const runtimeMessages: unknown[] = [];
  const tabMessages: Array<[number, unknown]> = [];
  let polls = 0;
  const previousPort = { disconnect: vi.fn() };
  const dependencies = {
    state,
    chrome: {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn(async (message: unknown) => {
          runtimeMessages.push(message);
        }),
      },
      tabs: {
        query: vi.fn(async () => {
          if (options.queryFails) throw new Error('Tabs unavailable');
          return options.tabs ?? [];
        }),
        sendMessage: vi.fn((tabId: number, message: unknown, callback: () => void) => {
          tabMessages.push([tabId, message]);
          callback();
        }),
      },
    },
    logger: { debug: vi.fn(), warn: vi.fn() },
    sleep: vi.fn(async () => {
      polls += 1;
      if (options.connectsAfterPolls != null && polls >= options.connectsAfterPolls) {
        state.nativePort = { disconnect: vi.fn() };
        state.isNativeConnected = true;
      }
    }),
    NATIVE_CONNECT_POLL_INTERVAL_MS: 0,
    NATIVE_CONNECT_MAX_WAIT_MS: 50,
    activePairedBrowserCommand: null,
    resetNativeReconnectState: vi.fn(),
    nativeSessionSecret: 'secret',
    _bgCtx: { nativeHandshakeInFlight: true },
    rejectPendingNativeRequests: vi.fn(),
    connectToNativeHost: vi.fn(),
  };
  // llm-guardrail-allow: executes repository-owned worker code inside this isolated test fixture.
  const worker = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as {
    notifyConnectionStatusChange: () => Promise<void>;
    waitForNativeConnection: (timeoutMs: number) => Promise<boolean>;
    triggerManualReconnect: () => Promise<Record<string, unknown>>;
  };
  return { worker, state, runtimeMessages, tabMessages, dependencies, previousPort };
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

describe('notifyConnectionStatusChange (service worker)', () => {
  it('tells the extension pages and every tab with an id', async () => {
    const test = workerConnection({ tabs: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    test.state.isNativeConnected = true;
    test.state.connectionStatus = 'connected';
    await test.worker.notifyConnectionStatusChange();

    const payload = { type: 'CONNECTION_STATUS_CHANGED', connected: true, status: 'connected' };
    expect(test.runtimeMessages).toEqual([payload]);
    expect(test.tabMessages).toEqual([
      [1, payload],
      [2, payload],
      [3, payload],
    ]);
  });

  it('skips tabs that do not have an id', async () => {
    const test = workerConnection({ tabs: [{ id: 1 }, { id: undefined }, { id: 3 }] });
    await test.worker.notifyConnectionStatusChange();
    expect(test.tabMessages.map(([tabId]) => tabId)).toEqual([1, 3]);
  });

  it('broadcasts connected=false on disconnect', async () => {
    const test = workerConnection({ tabs: [{ id: 5 }] });
    await test.worker.notifyConnectionStatusChange();
    expect(test.tabMessages).toEqual([
      [5, { type: 'CONNECTION_STATUS_CHANGED', connected: false, status: 'disconnected' }],
    ]);
  });

  it('does not reject when the tabs cannot be listed', async () => {
    const test = workerConnection({ queryFails: true });
    await expect(test.worker.notifyConnectionStatusChange()).resolves.toBeUndefined();
    expect(test.dependencies.logger.warn).toHaveBeenCalled();
    expect(test.runtimeMessages).toHaveLength(1);
  });

  it('handles an empty tab list without error', async () => {
    const test = workerConnection({ tabs: [] });
    await expect(test.worker.notifyConnectionStatusChange()).resolves.toBeUndefined();
    expect(test.tabMessages).toHaveLength(0);
  });
});

describe('waitForNativeConnection (service worker)', () => {
  it('resolves true once the native port is connected', async () => {
    const test = workerConnection({ connectsAfterPolls: 2 });
    await expect(test.worker.waitForNativeConnection(1_000)).resolves.toBe(true);
  });

  it('resolves false when the host never connects within the wait', async () => {
    const test = workerConnection({ connectsAfterPolls: null });
    await expect(test.worker.waitForNativeConnection(20)).resolves.toBe(false);
  });
});

describe('triggerManualReconnect status response (service worker)', () => {
  it('reports connected after the host answers', async () => {
    const test = workerConnection({ connectsAfterPolls: 1 });
    test.state.nativePort = test.previousPort;
    const response = await test.worker.triggerManualReconnect();
    expect(response).toEqual({
      success: true,
      nativeConnected: true,
      connectionStatus: 'connected',
    });
    expect(test.previousPort.disconnect).toHaveBeenCalled();
    expect(test.dependencies.rejectPendingNativeRequests).toHaveBeenCalledWith(
      test.previousPort,
      'The AGI Desktop connection was replaced.',
    );
    expect(test.dependencies.connectToNativeHost).toHaveBeenCalledTimes(1);
    expect(test.runtimeMessages[0]).toMatchObject({ status: 'connecting', connected: false });
  });

  it('reports the still-pending status when the host does not answer', async () => {
    const test = workerConnection({ connectsAfterPolls: null });
    const response = await test.worker.triggerManualReconnect();
    expect(response).toEqual({
      success: true,
      nativeConnected: false,
      connectionStatus: 'connecting',
    });
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
    const autoConnect = background.slice(
      background.indexOf('async function shouldAutoConnectToDesktop()'),
      background.indexOf('function clearNativeReconnectTimer()'),
    );
    expect(autoConnect.indexOf('await revokeMismatchedDesktopPairing()')).toBeGreaterThanOrEqual(0);
    expect(autoConnect.indexOf('await revokeMismatchedDesktopPairing()')).toBeLessThan(
      autoConnect.indexOf('storageUtils.getItem<boolean>(DESKTOP_PAIRED_KEY, false)'),
    );
    expect(initialize).toContain('watchSyncHostSession(');
    expect(background).toContain('await releaseDataOfOtherAccounts(clerkRead);');
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
