import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShellInkGlobals } from './shellTokenGlobals';

type Listener = () => void;

const created: FakeWindow[] = [];

class FakeWindow {
  listeners = new Map<string, Listener>();
  destroyed = false;
  loaded: string | null = null;
  webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
  constructor(public options: Record<string, unknown>) {
    created.push(this);
  }
  on(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }
  once(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }
  loadURL(url: string) {
    this.loaded = url;
    return Promise.resolve();
  }
  isDestroyed() {
    return this.destroyed;
  }
  show = vi.fn();
  close() {
    this.destroyed = true;
    this.listeners.get('closed')?.();
  }
}

const writeText = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  clipboard: { writeText },
  nativeTheme: { shouldUseDarkColors: true },
}));

beforeAll(defineShellInkGlobals);

const { closePairingWindow, showPairingWindow } = await import('../remote/pairingWindow');

const PAIRING = {
  code: 'ABCD1234WXYZ',
  qrPayload: `agiw3:ABCD1234WXYZ:${'ab'.repeat(32)}`,
  expiresAt: 1,
};

beforeEach(() => {
  created.length = 0;
  writeText.mockClear();
  closePairingWindow();
});

describe('the pairing window main draws the QR code in', () => {
  it('runs no script, has no preload, and shows a data: page main drew', async () => {
    await showPairingWindow(null, PAIRING, vi.fn(), () => true);

    const preferences = created[0]?.options['webPreferences'] as Record<string, unknown>;
    expect(preferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      javascript: false,
    });
    expect('preload' in preferences).toBe(false);
    expect(created[0]?.loaded).toMatch(/^data:text\/html/u);
    const page = decodeURIComponent(created[0]?.loaded ?? '');
    expect(page).toContain('<svg');
    expect(page).toContain(PAIRING.code);
    expect(page).toContain("default-src 'none'");
    expect(page).not.toMatch(/<script/iu);
  });

  it('draws in the shell tokens, follows the appearance, and has a ground to paint', async () => {
    await showPairingWindow(null, PAIRING, vi.fn(), () => true);

    const page = decodeURIComponent(created[0]?.loaded ?? '');
    expect(page).toContain('@media (prefers-color-scheme: dark)');
    expect(page).toContain('background: var(--ground)');
    expect(page).not.toMatch(/Canvas|GrayText/u);
    expect(created[0]?.options['backgroundColor']).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it('can neither navigate away nor open another window', async () => {
    await showPairingWindow(null, PAIRING, vi.fn(), () => true);

    const { setWindowOpenHandler, on } = created[0]!.webContents;
    const openHandler = setWindowOpenHandler.mock.calls[0]?.[0] as (details: { url: string }) => {
      action: string;
    };
    expect(openHandler({ url: 'https://example.com/' })).toEqual({ action: 'deny' });

    const navigation = on.mock.calls.find(([event]) => event === 'will-navigate');
    const willNavigate = navigation?.[1] as (event: {
      url: string;
      preventDefault: () => void;
    }) => void;
    const event = { url: 'https://example.com/', preventDefault: vi.fn() };
    willNavigate(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the code, never the QR secret, and says so on the page', async () => {
    await showPairingWindow(null, PAIRING, vi.fn(), () => true);
    const first = decodeURIComponent(created[0]?.loaded ?? '');
    expect(first).toContain('Copy code');
    const href = /href="([^"]+)"/u.exec(first)?.[1] ?? '';

    const navigation = created[0]!.webContents.on.mock.calls.find(
      ([event]) => event === 'will-navigate',
    );
    const willNavigate = navigation?.[1] as (event: {
      url: string;
      preventDefault: () => void;
    }) => void;
    const event = { url: href, preventDefault: vi.fn() };
    willNavigate(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PAIRING.code);
    expect(writeText).not.toHaveBeenCalledWith(PAIRING.qrPayload);
    expect(decodeURIComponent(created[0]?.loaded ?? '')).toContain('Code copied');
  });

  it('asks the app for a new code, and tells the user to open the app when none can answer', async () => {
    const refresh = vi.fn(() => true);
    await showPairingWindow(null, PAIRING, vi.fn(), refresh);
    const href = /href="(agi-pairing:refresh-code)"/u.exec(
      decodeURIComponent(created[0]?.loaded ?? ''),
    )?.[1];
    expect(href).toBeDefined();
    const navigation = created[0]!.webContents.on.mock.calls.find(
      ([event]) => event === 'will-navigate',
    );
    const willNavigate = navigation?.[1] as (event: {
      url: string;
      preventDefault: () => void;
    }) => void;

    willNavigate({ url: href!, preventDefault: vi.fn() });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(created[0]?.loaded ?? '')).not.toContain('to refresh the code');

    refresh.mockReturnValue(false);
    willNavigate({ url: href!, preventDefault: vi.fn() });
    expect(decodeURIComponent(created[0]?.loaded ?? '')).toContain('to refresh the code');
  });

  it('cancels pairing when the user closes it, and not when main closes it', async () => {
    const dismissed = vi.fn();
    await showPairingWindow(null, PAIRING, dismissed, () => true);
    closePairingWindow();
    expect(dismissed).not.toHaveBeenCalled();

    await showPairingWindow(null, PAIRING, dismissed, () => true);
    created[1]?.close();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('does not open a window for a pairing that was cancelled while the code was drawn', async () => {
    const shown = showPairingWindow(null, PAIRING, vi.fn(), () => true);
    closePairingWindow();
    await shown;
    expect(created).toEqual([]);
  });
});
