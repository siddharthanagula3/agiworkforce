import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeBrowserDriver } from '../src/features/native-bridge/nativeBrowserDriver';

const navigation = vi.hoisted(() => vi.fn());

vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/computer-use/cdpDriver')>()),
  navigate: navigation,
}));
vi.mock('../src/features/site-policy/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/site-policy/store')>()),
  assertSiteAccess: vi.fn(async () => undefined),
}));
vi.mock('../src/features/computer-use/browserControlConsent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/computer-use/browserControlConsent')>()),
  hasBrowserControlConsent: vi.fn(async () => true),
}));

const originalUrl = 'https://paired.example/start';
const tab = { id: 41, windowId: 7, active: true, url: originalUrl, status: 'complete' };
let loaderId = 'original-loader';
const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
const getTab = vi.fn(async () => ({ ...tab }));
let driver: NativeBrowserDriver | null = null;

beforeEach(() => {
  tab.url = originalUrl;
  loaderId = 'original-loader';
  navigation.mockReset();
  getTab.mockReset().mockImplementation(async () => ({ ...tab }));
  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    tabs: {
      get: getTab,
      query: vi.fn(async () => [{ ...tab }]),
      onUpdated: event(),
      onRemoved: event(),
      onActivated: event(),
    },
    windows: { getLastFocused: vi.fn(async () => ({ id: 7 })), onFocusChanged: event() },
    debugger: {
      attach: (_target: unknown, _version: unknown, callback: () => void) => callback(),
      detach: (_target: unknown, callback: () => void) => callback(),
      sendCommand: (
        _target: unknown,
        method: string,
        _params: unknown,
        callback: (result: unknown) => void,
      ) => {
        callback(
          method === 'Page.getFrameTree'
            ? { frameTree: { frame: { id: 'paired-frame', loaderId, url: tab.url } } }
            : {},
        );
      },
      onDetach: event(),
      onEvent: event(),
    },
  });
});

afterEach(async () => {
  await driver?.dispose();
  driver = null;
  vi.unstubAllGlobals();
});

describe('paired browser navigation ownership', () => {
  it('re-authorizes the declared destination when navigation commits between reads', async () => {
    const current = new NativeBrowserDriver(new AbortController(), () => undefined);
    driver = current;
    expect(await current.resolveTabId(41)).toBe(41);
    navigation.mockImplementationOnce(async (_tabId: number, url: string) => {
      getTab.mockImplementationOnce(async () => {
        const before = { ...tab };
        tab.url = url;
        return before;
      });
      await current.assertOwnership(41);
      loaderId = 'destination-loader';
    });
    await expect(current.navigate(41, 'https://paired.example/next')).resolves.toBeUndefined();
    expect(tab.url).toBe('https://paired.example/next');
    expect(current.signal.aborted).toBe(false);
  });

  it('rejects a user navigation with no declared command destination', async () => {
    const current = new NativeBrowserDriver(new AbortController(), () => undefined);
    driver = current;
    expect(await current.resolveTabId(41)).toBe(41);
    getTab.mockImplementationOnce(async () => {
      const before = { ...tab };
      tab.url = 'https://paired.example/other';
      return before;
    });
    await expect(current.assertOwnership(41)).rejects.toThrow('changed while its access');
    expect(current.signal.aborted).toBe(true);
    expect(navigation).not.toHaveBeenCalled();
  });
});
