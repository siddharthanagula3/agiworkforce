/**
 * The content script asks the service worker whether its page is approved. It
 * asks only once the document is active (a prerendered document is not the
 * outermost frame of the active page yet) and asks again when the worker says
 * the answer changed.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type UtilsModule = typeof import('../src/utils');
type WebMcpModule = typeof import('../src/webmcp');

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, '\\$1');
}

const harness = vi.hoisted(() => {
  const pageAccess = { approved: true, inPagePanel: true };
  const chromeMock = {
    runtime: {
      id: 'ext-id',
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(),
      lastError: undefined as string | undefined,
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
    },
  };
  (globalThis as Record<string, unknown>).chrome = chromeMock;
  return {
    pageAccess,
    chromeMock,
    setupInPagePanel: vi.fn().mockResolvedValue(undefined),
    discoverAllTools: vi.fn(() => ({ supported: false, tools: [], url: '', timestamp: 0 })),
    stopWatchingToolChanges: vi.fn(),
  };
});

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<UtilsModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/jobAutofill', () => ({ runPlatformJobAutofill: vi.fn() }));

vi.mock('../src/webmcp', async (importOriginal) => ({
  ...(await importOriginal<WebMcpModule>()),
  discoverAllTools: harness.discoverAllTools,
  callTool: vi.fn(),
  startToolChangeReporting: vi.fn(),
  stopWatchingToolChanges: harness.stopWatchingToolChanges,
}));

vi.mock('../src/page-metadata', () => ({ extractPageMetadata: vi.fn(() => ({})) }));

vi.mock('../src/inPagePanel/setup', () => ({ setupInPagePanel: harness.setupInPagePanel }));

function sentTypes(): string[] {
  return harness.chromeMock.runtime.sendMessage.mock.calls.map(
    (call) => (call[0] as { type: string }).type,
  );
}

function resetWorkerReplies(): void {
  harness.chromeMock.runtime.sendMessage.mockImplementation(async (message: { type?: string }) => {
    if (message.type === 'GET_PAGE_ACCESS') return { success: true, ...harness.pageAccess };
    return { success: true };
  });
}

async function loadContent(): Promise<typeof import('../src/content')> {
  vi.resetModules();
  Reflect.deleteProperty(window, '__agiWorkforceContentScriptReady');
  return import('../src/content');
}

function deliver(
  content: typeof import('../src/content'),
  message: Record<string, unknown>,
  sender: Partial<chrome.runtime.MessageSender> = { id: 'ext-id' },
): Promise<unknown> {
  return new Promise((resolve) => {
    content.handleMessage(message, sender as chrome.runtime.MessageSender, resolve);
  });
}

beforeEach(() => {
  harness.pageAccess.approved = true;
  harness.pageAccess.inPagePanel = true;
  harness.chromeMock.runtime.sendMessage.mockReset();
  harness.setupInPagePanel.mockClear();
  harness.discoverAllTools.mockClear();
  harness.stopWatchingToolChanges.mockClear();
  resetWorkerReplies();
  Reflect.deleteProperty(document, 'prerendering');
});

describe('asking the worker about the page', () => {
  it('waits for a prerendered document to be activated before asking', async () => {
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    await loadContent();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentTypes()).not.toContain('GET_PAGE_ACCESS');
    expect(harness.setupInPagePanel).not.toHaveBeenCalled();

    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    document.dispatchEvent(new Event('prerenderingchange'));

    await vi.waitFor(() => expect(sentTypes()).toContain('GET_PAGE_ACCESS'));
    await vi.waitFor(() =>
      expect(harness.setupInPagePanel).toHaveBeenCalledWith(
        { approved: true, inPagePanel: true },
        expect.anything(),
      ),
    );
  });

  it('asks straight away when the document is not prerendered', async () => {
    await loadContent();
    await vi.waitFor(() => expect(sentTypes()).toContain('GET_PAGE_ACCESS'));
  });

  it('asks again when the page is restored from the back-forward cache', async () => {
    await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalledTimes(1));
    harness.pageAccess.approved = false;

    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);

    await vi.waitFor(() =>
      expect(harness.setupInPagePanel).toHaveBeenLastCalledWith(
        { approved: false, inPagePanel: false },
        expect.anything(),
      ),
    );
  });
});

describe('PAGE_ACCESS_CHANGED', () => {
  it('asks the worker again and applies the new answer to the in-page panel', async () => {
    const content = await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalledTimes(1));

    harness.pageAccess.inPagePanel = false;
    await expect(deliver(content, { type: 'PAGE_ACCESS_CHANGED' })).resolves.toEqual({
      success: true,
    });

    expect(harness.setupInPagePanel).toHaveBeenCalledTimes(2);
    expect(harness.setupInPagePanel).toHaveBeenLastCalledWith(
      { approved: true, inPagePanel: false },
      expect.anything(),
    );
  });

  it('starts the approved-page work once, the first time the page becomes approved', async () => {
    harness.pageAccess.approved = false;
    harness.pageAccess.inPagePanel = false;
    const content = await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalledTimes(1));
    expect(sentTypes()).not.toContain('TAB_READY');

    harness.pageAccess.approved = true;
    harness.pageAccess.inPagePanel = true;
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });

    expect(sentTypes().filter((type) => type === 'TAB_READY')).toHaveLength(1);
  });

  it('is not honoured when it comes from a tab instead of the extension', async () => {
    const content = await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalledTimes(1));
    const before = sentTypes().filter((type) => type === 'GET_PAGE_ACCESS').length;

    const reply = await deliver(
      content,
      { type: 'PAGE_ACCESS_CHANGED' },
      {
        id: 'ext-id',
        tab: { id: 3 } as chrome.tabs.Tab,
      },
    );

    expect(reply).toMatchObject({ success: false });
    expect(sentTypes().filter((type) => type === 'GET_PAGE_ACCESS')).toHaveLength(before);
  });

  it('ignores the latest-but-stale answer when a newer question was asked meanwhile', async () => {
    const content = await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalledTimes(1));

    let releaseSlow: (value: unknown) => void = () => undefined;
    harness.chromeMock.runtime.sendMessage.mockImplementationOnce(
      () => new Promise((resolve) => (releaseSlow = resolve)),
    );
    const slow = deliver(content, { type: 'PAGE_ACCESS_CHANGED' });

    harness.pageAccess.inPagePanel = false;
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });
    releaseSlow({ success: true, approved: true, inPagePanel: true });
    await slow;

    expect(harness.setupInPagePanel).toHaveBeenLastCalledWith(
      { approved: true, inPagePanel: false },
      expect.anything(),
    );
    expect(harness.setupInPagePanel).toHaveBeenCalledTimes(2);
  });
});

describe('a page whose approval is withdrawn', () => {
  it('stops watching for site tools and starts again when approval returns', async () => {
    const content = await loadContent();
    await vi.waitFor(() => expect(sentTypes()).toContain('TAB_READY'));

    harness.pageAccess.approved = false;
    harness.pageAccess.inPagePanel = false;
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });
    expect(harness.stopWatchingToolChanges).toHaveBeenCalledTimes(1);

    harness.chromeMock.runtime.sendMessage.mockClear();
    harness.pageAccess.approved = true;
    harness.pageAccess.inPagePanel = true;
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });
    expect(sentTypes().filter((type) => type === 'TAB_READY')).toHaveLength(1);
  });

  it('cancels the pending start of site-tool discovery if approval goes first', async () => {
    const timers: Array<{ handle: unknown; delay: unknown }> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: () => void,
      delay?: number,
    ) => {
      const handle = realSetTimeout(callback, delay);
      timers.push({ handle, delay });
      return handle;
    }) as typeof setTimeout);
    const clear = vi.spyOn(globalThis, 'clearTimeout');

    const content = await loadContent();
    await vi.waitFor(() => expect(sentTypes()).toContain('TAB_READY'));
    const discoveryTimer = timers.find((timer) => timer.delay === 1_000);
    expect(discoveryTimer).toBeDefined();

    harness.pageAccess.approved = false;
    harness.pageAccess.inPagePanel = false;
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });

    expect(clear).toHaveBeenCalledWith(discoveryTimer!.handle);
  });

  it('does nothing extra for a page that was never approved', async () => {
    harness.pageAccess.approved = false;
    harness.pageAccess.inPagePanel = false;
    const content = await loadContent();
    await vi.waitFor(() => expect(harness.setupInPagePanel).toHaveBeenCalled());
    await deliver(content, { type: 'PAGE_ACCESS_CHANGED' });
    expect(harness.stopWatchingToolChanges).not.toHaveBeenCalled();
  });
});
