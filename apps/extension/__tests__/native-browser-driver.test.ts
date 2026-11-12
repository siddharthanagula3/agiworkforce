import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeBrowserDriver } from '../src/features/native-bridge/nativeBrowserDriver';
import {
  PAIRED_PURCHASE_REFUSAL,
  PROTECTED_FIELD_REFUSAL,
} from '../src/features/computer-use/approvalPolicy';
import { packagedManifest } from './fixtures/packaged-manifest';

const navigation = vi.hoisted(() => vi.fn());
const target = vi.hoisted(() => ({
  signature: vi.fn(async (): Promise<string | null> => null),
  protectedField: vi.fn(async () => false),
  typed: vi.fn(async () => ({ inputSource: 'cdp' })),
  clicked: vi.fn(async () => undefined),
  activation: vi.fn(async () => ({ kind: 'none' })),
}));

vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  navigate: navigation,
  getTargetSignature: target.signature,
  isProtectedFieldTarget: target.protectedField,
  typeIntoSelector: target.typed,
  click: target.clicked,
  inspectSelectorActivation: target.activation,
}));
vi.mock('../src/features/site-policy/store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  assertSiteAccess: vi.fn(async () => undefined),
}));
vi.mock('../src/features/computer-use/browserControlConsent', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
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
    runtime: { lastError: null, getManifest: packagedManifest },
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

describe('paired click and typing hold the protected-field and purchase bar', () => {
  async function ownedDriver(): Promise<NativeBrowserDriver> {
    const current = new NativeBrowserDriver(new AbortController(), () => undefined);
    driver = current;
    expect(await current.resolveTabId(41)).toBe(41);
    return current;
  }

  beforeEach(() => {
    for (const mock of Object.values(target)) mock.mockClear();
    target.protectedField.mockResolvedValue(false);
  });

  it.each([
    ['a field labelled as a card number', 'input||text|cardnumber||Card number', false],
    ['a one-time code field', 'input||text|otp||Verification code', false],
    ['a field only its autocomplete marks as a card field', 'input||text|f1||', true],
  ])('refuses to type into %s', async (_label, signature, protectedField) => {
    target.signature.mockResolvedValue(signature);
    target.protectedField.mockResolvedValue(protectedField);
    const current = await ownedDriver();

    await expect(current.type(41, '#field', '4111111111111111', false)).rejects.toThrow(
      PROTECTED_FIELD_REFUSAL,
    );
    expect(target.typed).not.toHaveBeenCalled();
  });

  it('types into an ordinary field, bound to the signature it checked', async () => {
    target.signature.mockResolvedValue('input||search|q||Search');
    const current = await ownedDriver();

    await current.type(41, '#q', 'shoes', false);

    expect(target.typed).toHaveBeenCalledWith(
      41,
      '#q',
      'shoes',
      false,
      current.signal,
      'input||search|q||Search',
    );
  });

  it('refuses a click that completes a purchase', async () => {
    target.signature.mockResolvedValue('button||submit||Place order|');
    const current = await ownedDriver();

    await expect(current.click(41, '#buy')).rejects.toThrow(PAIRED_PURCHASE_REFUSAL);
    expect(target.clicked).not.toHaveBeenCalled();
  });

  it('clicks an ordinary button', async () => {
    target.signature.mockResolvedValue('button||button||Show details|');
    const current = await ownedDriver();

    await current.click(41, '#details');

    expect(target.clicked).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('../src/features/computer-use/cdpDriver');
type ImportedModule1 = typeof import('../src/features/site-policy/store');
type ImportedModule2 = typeof import('../src/features/computer-use/browserControlConsent');
