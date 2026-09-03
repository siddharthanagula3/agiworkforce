import { describe, expect, it, vi } from 'vitest';

const clerkOpenSignIn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const accountRefresh = vi.hoisted(() =>
  vi.fn(
    async (
      _getToken: () => Promise<string | null>,
      render: (state: { signedIn: boolean; unavailable: boolean; loading: boolean }) => void,
    ) => {
      render({ signedIn: false, unavailable: false, loading: false });
    },
  ),
);

const chromeHarness = vi.hoisted(() => {
  class FakeStyleSheet {
    replaceSync(): void {}
  }
  (globalThis as Record<string, unknown>).CSSStyleSheet = FakeStyleSheet;
  Object.defineProperty(globalThis.document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });

  const storageSet = vi.fn((_items: unknown, cb?: () => void) => {
    if (cb) cb();
    return Promise.resolve();
  });
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      getManifest: () => ({ version: '1.2.3' }),
      getURL: (path: string) => `chrome-extension://test/${path}`,
      lastError: undefined,
    },
    storage: {
      local: {
        get: (_keys: unknown, cb?: (result: Record<string, unknown>) => void) => {
          if (cb) cb({});
          return Promise.resolve({});
        },
        set: storageSet,
        remove: () => Promise.resolve(),
      },
    },
    tabs: {
      query: (_q: unknown, cb?: (tabs: unknown[]) => void) => {
        if (cb) cb([]);
        return Promise.resolve([]);
      },
      create: () => Promise.resolve({}),
    },
    commands: {
      getAll: (
        cb: (commands: Array<{ name: string; description: string; shortcut?: string }>) => void,
      ) =>
        cb([
          { name: '_execute_action', description: 'Open side panel', shortcut: 'Alt+Shift+G' },
          { name: 'capture_page', description: 'Capture page' },
        ]),
    },
  };
  return { storageSet };
});

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  getAuthToken: vi.fn().mockResolvedValue(null),
  clearAuthToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', () => ({
  isClerkExtensionAuthConfigured: () => true,
  openClerkSignIn: clerkOpenSignIn,
}));

vi.mock('../src/features/options/account-state', () => ({
  beginOptionsAccountRefresh: accountRefresh,
}));

describe('options page, Help', () => {
  it('renders the responsive AGI settings shell and section navigation', async () => {
    await import('../src/options');

    expect(document.querySelector('.opt-shell')).not.toBeNull();
    expect(document.querySelector('.opt-sidebar')).not.toBeNull();
    expect(document.querySelector('h1.opt-header-title')?.textContent).toBe('AGI Chrome settings');
    expect(document.querySelectorAll('h2.opt-section-title').length).toBeGreaterThanOrEqual(5);
    const targets = Array.from(document.querySelectorAll<HTMLButtonElement>('.opt-nav-item')).map(
      (button) => button.dataset.target,
    );
    expect(targets).toEqual([
      'opt-permissions',
      'opt-privacy',
      'opt-account',
      'opt-preferences',
      'opt-shortcuts',
      'opt-help',
    ]);
    for (const target of targets) expect(document.getElementById(target!)).not.toBeNull();
  });

  it('keeps Add disabled and never stores a label when no web site is open', async () => {
    await import('../src/options');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const addButton = document.querySelector<HTMLButtonElement>('#opt-add-btn');
    expect(document.querySelector('#opt-current-origin')?.textContent).toBe('No site open');
    expect(addButton?.disabled).toBe(true);

    chromeHarness.storageSet.mockClear();
    addButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeHarness.storageSet).not.toHaveBeenCalled();
  });

  it('keeps keyboard navigation state synchronized with the visible destination', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const shortcutsButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.opt-nav-item'),
    ).find((button) => button.dataset.target === 'opt-shortcuts');
    expect(shortcutsButton).toBeDefined();

    shortcutsButton!.click();

    expect(shortcutsButton!.classList.contains('active')).toBe(true);
    expect(shortcutsButton!.getAttribute('aria-current')).toBe('location');
    expect(document.querySelectorAll('.opt-nav-item.active')).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('renders Chrome’s current command bindings instead of stale manifest defaults', () => {
    const shortcutRows = Array.from(document.querySelectorAll('#opt-shortcuts tbody tr')).map(
      (row) => row.textContent?.replace(/[\s+]/g, ''),
    );
    expect(shortcutRows).toEqual(
      expect.arrayContaining([
        expect.stringContaining('AltShiftG'),
        expect.stringContaining('Notassigned'),
      ]),
    );
  });

  it('advances one sign-in handler to account refresh without reopening auth', async () => {
    const signInButton = document.querySelector<HTMLButtonElement>('#opt-signin-btn');
    expect(signInButton?.textContent).toBe('Sign in');

    signInButton!.click();
    await vi.waitFor(() => expect(signInButton?.textContent).toBe('Check sign-in'));
    expect(clerkOpenSignIn).toHaveBeenCalledTimes(1);

    signInButton!.click();
    await vi.waitFor(() => expect(accountRefresh.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(clerkOpenSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders a Help section linking to real web routes', async () => {
    await import('../src/options');

    const titles = Array.from(document.querySelectorAll('.opt-section-title')).map(
      (node) => node.textContent,
    );
    expect(titles).toContain('Help');

    const paths = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.opt-link')).map(
      (anchor) => new URL(anchor.href).pathname,
    );
    expect(paths).toEqual(expect.arrayContaining(['/help', '/docs', '/support']));
  });

  it('opens help destinations in a new tab without leaking the opener', () => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.opt-link'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(new URL(anchor.href).origin).toBe('https://agiworkforce.com');
      expect(anchor.target).toBe('_blank');
      expect(anchor.rel).toContain('noopener');
    }
  });
});
