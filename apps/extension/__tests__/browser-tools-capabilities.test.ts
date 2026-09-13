/**
 * The three browser capabilities the side panel and the computer-use runner
 * share: downloads, console capture and network capture. Each one reaches a
 * real page, so the cases that matter are the refusals, what is redacted before
 * anything is stored, and that a watch and a per-action attach cannot tear each
 * other down.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SITE = 'https://allowed.example';
const OTHER = 'https://other.example';
const TAB_ID = 31;

const store: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};
const grantedOrigins = new Set<string>();
const tabs = new Map<number, { id: number; url: string }>();

const debuggerCalls = { attach: 0, detach: 0 };
const sentCommands: Array<{ tabId: number | undefined; method: string }> = [];

function areaFor(backing: Record<string, unknown>) {
  return {
    get: vi.fn((keys?: unknown) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: backing[keys] });
      if (Array.isArray(keys)) {
        return Promise.resolve(Object.fromEntries(keys.map((key) => [key, backing[key]])));
      }
      return Promise.resolve({ ...backing });
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(backing, items);
      return Promise.resolve();
    }),
  };
}

vi.stubGlobal('chrome', {
  runtime: { id: 'browser-tools-test', lastError: undefined },
  storage: { local: areaFor(store), session: areaFor(sessionStore) },
  permissions: {
    contains: vi.fn((permissions: { origins?: string[] }) =>
      Promise.resolve((permissions.origins ?? []).every((p) => grantedOrigins.has(p))),
    ),
    request: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)),
  },
  tabs: {
    get: vi.fn((tabId: number) => {
      const tab = tabs.get(tabId);
      return tab ? Promise.resolve(tab) : Promise.reject(new Error('no tab'));
    }),
  },
  downloads: {
    download: vi.fn(() => Promise.resolve(900)),
    search: vi.fn(() => Promise.resolve([])),
    show: vi.fn(),
    onChanged: { addListener: vi.fn() },
  },
  debugger: {
    attach: vi.fn((_target: unknown, _version: string, callback: () => void) => {
      debuggerCalls.attach += 1;
      callback();
    }),
    detach: vi.fn((_target: unknown, callback: () => void) => {
      debuggerCalls.detach += 1;
      callback();
    }),
    sendCommand: vi.fn(
      (
        target: { tabId?: number },
        method: string,
        _params: unknown,
        callback: (result: unknown) => void,
      ) => {
        sentCommands.push({ tabId: target.tabId, method });
        callback({});
      },
    ),
    onDetach: { addListener: vi.fn() },
    onEvent: { addListener: vi.fn() },
  },
});

const { authorizeBrowserToolTab } = await import('../src/features/browser-tools/tabAuthority');
const { resolveDownloadUrl, startBrowserToolDownload, listSessionDownloads, revealDownload } =
  await import('../src/features/browser-tools/downloads');
const { recordConsoleEvent, readConsoleEntries, clearConsoleEntries } =
  await import('../src/features/browser-tools/consoleCapture');
const { recordNetworkEvent, readNetworkEntries, clearNetworkEntries, summarizeRequestUrl } =
  await import('../src/features/browser-tools/networkCapture');
const { startPageWatch, stopPageWatch, isPageWatchActive, forgetPageWatchTab } =
  await import('../src/features/browser-tools/pageWatch');
const { acquireDebugger, releaseDebugger } =
  await import('../src/features/computer-use/debuggerSession');
const { MESSAGE_POLICY } = await import('../src/background/policy');

function approveSite(): void {
  store['agi_site_allowlist'] = [SITE];
  store['agi_cu_browser_control_consent'] = [SITE];
  grantedOrigins.add(`${SITE}/*`);
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  for (const key of Object.keys(sessionStore)) delete sessionStore[key];
  grantedOrigins.clear();
  tabs.clear();
  tabs.set(TAB_ID, { id: TAB_ID, url: `${SITE}/article` });
  debuggerCalls.attach = 0;
  debuggerCalls.detach = 0;
  sentCommands.length = 0;
  clearConsoleEntries(TAB_ID);
  clearNetworkEntries(TAB_ID);
  forgetPageWatchTab(TAB_ID);
});

describe('browser-tool permission gate', () => {
  it('refuses a tab whose origin is not on the approved-site list', async () => {
    await expect(authorizeBrowserToolTab(TAB_ID)).rejects.toThrow(/approved-sites list/);
  });

  it('refuses an approved site that has not granted full browser control', async () => {
    store['agi_site_allowlist'] = [SITE];
    await expect(authorizeBrowserToolTab(TAB_ID)).rejects.toThrow(
      /has not been granted full Chrome DevTools Protocol control/,
    );
  });

  it('refuses an approved, consented origin that Chrome has not granted host access to', async () => {
    store['agi_site_allowlist'] = [SITE];
    store['agi_cu_browser_control_consent'] = [SITE];
    await expect(authorizeBrowserToolTab(TAB_ID)).rejects.toThrow(/DevTools Protocol control/);
  });

  it('reads the origin from the tab at call time, not from the caller', async () => {
    approveSite();
    tabs.set(TAB_ID, { id: TAB_ID, url: `${OTHER}/moved-here` });
    await expect(authorizeBrowserToolTab(TAB_ID)).rejects.toThrow(/approved-sites list/);
  });

  it('admits an approved, consented, host-granted tab', async () => {
    approveSite();
    await expect(authorizeBrowserToolTab(TAB_ID)).resolves.toMatchObject({ origin: SITE });
  });

  it('gates all three new message types to extension pages only', () => {
    for (const type of [
      'START_DOWNLOAD',
      'LIST_DOWNLOADS',
      'REVEAL_DOWNLOAD',
      'SET_PAGE_WATCH',
      'READ_PAGE_CONSOLE',
      'READ_PAGE_NETWORK',
    ]) {
      expect(MESSAGE_POLICY[type]?.senderClass, type).toBe('extension-page-only');
    }
  });
});

describe('downloads', () => {
  it('refuses a destination that is neither the page origin nor allowlisted', async () => {
    approveSite();
    await expect(resolveDownloadUrl(`${OTHER}/payload.exe`, `${SITE}/article`)).rejects.toThrow(
      /site allowlist/,
    );
  });

  it('refuses a non-http scheme', async () => {
    approveSite();
    await expect(resolveDownloadUrl('file:///etc/passwd', `${SITE}/article`)).rejects.toThrow(
      /only http and https/,
    );
  });

  it('resolves a relative path against the page it was invoked from', async () => {
    approveSite();
    await expect(resolveDownloadUrl('/files/report.pdf', `${SITE}/article`)).resolves.toBe(
      `${SITE}/files/report.pdf`,
    );
  });

  it('refuses to start before the gate passes, and never calls Chrome', async () => {
    await expect(startBrowserToolDownload(TAB_ID, `${SITE}/f.pdf`)).rejects.toThrow(
      /approved-sites list/,
    );
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('lets Chrome choose the filename so a page cannot steer the path', async () => {
    approveSite();
    await startBrowserToolDownload(TAB_ID, `${SITE}/files/report.pdf`);
    const [request] = vi.mocked(chrome.downloads.download).mock.calls.at(-1) ?? [];
    expect(request).toEqual({ url: `${SITE}/files/report.pdf`, conflictAction: 'uniquify' });
  });

  it('records the download in the session ledger', async () => {
    approveSite();
    await startBrowserToolDownload(TAB_ID, `${SITE}/files/report.pdf`);
    const ledger = await listSessionDownloads();
    expect(ledger.map((entry) => entry.origin)).toContain(SITE);
  });

  it('refuses to reveal a download AGI did not start', async () => {
    await expect(revealDownload(4242)).rejects.toThrow(/not started by AGI/);
    expect(chrome.downloads.show).not.toHaveBeenCalled();
  });
});

describe('console capture', () => {
  it('captures a console.error with its level and origin file', () => {
    recordConsoleEvent(TAB_ID, 'Runtime.consoleAPICalled', {
      type: 'error',
      timestamp: 1_000,
      args: [{ type: 'string', value: 'boom failed' }],
      stackTrace: { callFrames: [{ url: `${SITE}/app.js`, lineNumber: 11 }] },
    });
    expect(readConsoleEntries(TAB_ID)).toEqual([
      {
        at: 1_000,
        level: 'error',
        source: 'console',
        text: 'boom failed',
        url: `${SITE}/app.js`,
        line: 12,
      },
    ]);
  });

  it('captures an uncaught exception', () => {
    recordConsoleEvent(TAB_ID, 'Runtime.exceptionThrown', {
      timestamp: 2_000,
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'TypeError: x is not a function' },
      },
    });
    expect(readConsoleEntries(TAB_ID)[0]).toMatchObject({
      level: 'error',
      source: 'uncaught',
      text: 'TypeError: x is not a function',
    });
  });

  it('redacts a secret a page logged before it is ever buffered', () => {
    recordConsoleEvent(TAB_ID, 'Runtime.consoleAPICalled', {
      type: 'log',
      timestamp: 3_000,
      args: [
        { type: 'string', value: 'auth sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' },
      ],
    });
    const [entry] = readConsoleEntries(TAB_ID);
    expect(entry?.text).not.toContain('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ');
  });

  it('filters by pattern and by level', () => {
    recordConsoleEvent(TAB_ID, 'Runtime.consoleAPICalled', {
      type: 'error',
      timestamp: 4_000,
      args: [{ value: 'fetch failed for /api/orders' }],
    });
    recordConsoleEvent(TAB_ID, 'Runtime.consoleAPICalled', {
      type: 'log',
      timestamp: 5_000,
      args: [{ value: 'ready' }],
    });
    expect(readConsoleEntries(TAB_ID, { level: 'error' })).toHaveLength(1);
    expect(readConsoleEntries(TAB_ID, { pattern: 'orders' })).toHaveLength(1);
    expect(readConsoleEntries(TAB_ID, { pattern: 'nothing-here' })).toHaveLength(0);
  });

  it('rejects a pattern that is not a regular expression rather than matching everything', () => {
    expect(() => readConsoleEntries(TAB_ID, { pattern: '([' })).toThrow(/valid regular expression/);
  });

  it('keeps only the most recent messages once the buffer is full', () => {
    for (let index = 0; index < 250; index += 1) {
      recordConsoleEvent(TAB_ID, 'Runtime.consoleAPICalled', {
        type: 'log',
        timestamp: 10_000 + index * 1_000,
        args: [{ value: `message ${index}` }],
      });
    }
    const entries = readConsoleEntries(TAB_ID);
    expect(entries).toHaveLength(200);
    expect(entries.at(-1)?.text).toBe('message 249');
  });
});

describe('network capture', () => {
  function sendRequest(requestId: string, url: string, type = 'XHR'): void {
    recordNetworkEvent(TAB_ID, 'Network.requestWillBeSent', {
      requestId,
      timestamp: 1,
      type,
      request: { url, method: 'GET' },
    });
  }

  it('records url, method, status, type and timing', () => {
    sendRequest('r1', `${SITE}/api/items`);
    recordNetworkEvent(TAB_ID, 'Network.responseReceived', {
      requestId: 'r1',
      type: 'XHR',
      response: { status: 200, statusText: 'OK' },
    });
    recordNetworkEvent(TAB_ID, 'Network.loadingFinished', {
      requestId: 'r1',
      timestamp: 1.25,
      encodedDataLength: 812,
    });
    expect(readNetworkEntries(TAB_ID)[0]).toMatchObject({
      method: 'GET',
      status: 200,
      resourceType: 'XHR',
      durationMs: 250,
      bytes: 812,
      url: `${SITE}/api/items`,
    });
  });

  it('records a failure with its reason', () => {
    sendRequest('r2', `${SITE}/api/down`);
    recordNetworkEvent(TAB_ID, 'Network.loadingFailed', {
      requestId: 'r2',
      timestamp: 1.1,
      errorText: 'net::ERR_CONNECTION_REFUSED',
    });
    expect(readNetworkEntries(TAB_ID, { failedOnly: true })[0]?.failure).toBe(
      'net::ERR_CONNECTION_REFUSED',
    );
  });

  it('strips credentials out of the request line before storing it', () => {
    expect(summarizeRequestUrl('https://user:pass@host.example/a?access_token=abc&page=2')).toBe(
      'https://host.example/a?access_token=&page=2',
    );
  });

  it('never stores a fragment or a body field', () => {
    sendRequest('r3', `${SITE}/page?q=shoes#section`);
    const [entry] = readNetworkEntries(TAB_ID);
    expect(entry?.url).toBe(`${SITE}/page?q=shoes`);
    expect(Object.keys(entry ?? {})).not.toContain('body');
    expect(Object.keys(entry ?? {})).not.toContain('headers');
  });

  it('filters by url pattern and resource type', () => {
    sendRequest('r4', `${SITE}/api/a`, 'Fetch');
    sendRequest('r5', `${SITE}/img/b.png`, 'Image');
    expect(readNetworkEntries(TAB_ID, { pattern: 'img' })).toHaveLength(1);
    expect(readNetworkEntries(TAB_ID, { resourceType: 'fetch' })).toHaveLength(1);
  });
});

describe('page watch lifecycle', () => {
  it('refuses to start on a tab that has not passed the gate', async () => {
    await expect(startPageWatch(TAB_ID, 'user')).rejects.toThrow(/approved-sites list/);
    expect(isPageWatchActive(TAB_ID)).toBe(false);
  });

  it('enables the console and network domains once the gate passes', async () => {
    approveSite();
    await startPageWatch(TAB_ID, 'user');
    expect(sentCommands.map((entry) => entry.method)).toEqual([
      'Runtime.enable',
      'Log.enable',
      'Network.enable',
    ]);
    await stopPageWatch(TAB_ID, 'user');
  });

  it('survives a per-action attach and detach while a user watch is open', async () => {
    approveSite();
    await startPageWatch(TAB_ID, 'user');
    const detachesAfterStart = debuggerCalls.detach;

    await acquireDebugger(TAB_ID);
    await releaseDebugger(TAB_ID);

    expect(debuggerCalls.detach).toBe(detachesAfterStart);
    expect(isPageWatchActive(TAB_ID)).toBe(true);

    await stopPageWatch(TAB_ID, 'user');
    expect(debuggerCalls.detach).toBe(detachesAfterStart + 1);
    expect(isPageWatchActive(TAB_ID)).toBe(false);
  });

  it('holds the watch open until both the run and the user have let go', async () => {
    approveSite();
    await startPageWatch(TAB_ID, 'run');
    await startPageWatch(TAB_ID, 'user');
    await stopPageWatch(TAB_ID, 'run');
    expect(isPageWatchActive(TAB_ID)).toBe(true);
    await stopPageWatch(TAB_ID, 'user');
    expect(isPageWatchActive(TAB_ID)).toBe(false);
  });
});
