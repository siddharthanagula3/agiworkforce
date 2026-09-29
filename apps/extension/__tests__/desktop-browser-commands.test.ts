/**
 * Page work a paired desktop asks for.
 *
 * The desktop has its own approval dialog, so what matters here is that this
 * side still refuses: an unapproved origin, a tab that is not there, and an
 * action from a protocol version this build does not know.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_COMMAND_PROTOCOL_VERSION, type BrowserCommandRequest } from '@agiworkforce/types';

const SITE = 'https://allowed.example';
const TAB_ID = 41;

const store: Record<string, unknown> = {};
const grantedOrigins = new Set<string>();
const tabs = new Map<number, { id: number; url: string }>();

vi.stubGlobal('chrome', {
  runtime: { id: 'desktop-commands-test', lastError: undefined },
  storage: {
    local: {
      get: vi.fn((keys?: unknown) => {
        if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
        if (Array.isArray(keys)) {
          return Promise.resolve(Object.fromEntries(keys.map((key) => [key, store[key]])));
        }
        return Promise.resolve({ ...store });
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      }),
    },
  },
  permissions: {
    contains: vi.fn((permissions: { origins?: string[] }) =>
      Promise.resolve((permissions.origins ?? []).every((pattern) => grantedOrigins.has(pattern))),
    ),
  },
  downloads: {
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    get: vi.fn((tabId: number) => {
      const tab = tabs.get(tabId);
      return tab ? Promise.resolve(tab) : Promise.reject(new Error('no tab'));
    }),
  },
});

const { runDesktopBrowserCommand, MAX_DESKTOP_PAGE_TEXT_CHARS } =
  await import('../src/features/native-bridge/desktopCommands');

function request(command: string, args: Record<string, unknown> = {}): BrowserCommandRequest {
  return {
    version: BROWSER_COMMAND_PROTOCOL_VERSION,
    id: 'cmd-1',
    command: command as BrowserCommandRequest['command'],
    args,
  };
}

function context(
  send: (tabId: number, message: Record<string, unknown>) => Promise<Record<string, unknown>>,
  navigate = vi.fn(() => Promise.resolve()),
) {
  return {
    resolveTabId: () => Promise.resolve(TAB_ID),
    send,
    navigate,
    history: vi.fn(() => Promise.resolve()),
    tabUrl: vi.fn(() => Promise.resolve(`${SITE}/page`)),
    capture: () => Promise.resolve('iVBORw0KGgo='),
  };
}

function approveSite(): void {
  store['agi_site_allowlist'] = [SITE];
  store['agi_cu_browser_control_consent'] = [SITE];
  grantedOrigins.add(`${SITE}/*`);
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  grantedOrigins.clear();
  tabs.clear();
  tabs.set(TAB_ID, { id: TAB_ID, url: `${SITE}/page` });
});

describe('desktop-issued browser commands', () => {
  it('refuses a request this build does not understand', async () => {
    approveSite();
    const result = await runDesktopBrowserCommand(
      { version: 99, id: 'cmd-9', command: 'browser_click', args: {} },
      context(vi.fn()),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not support/);
    expect(result.id).toBe('cmd-9');
  });

  it('refuses every command on a site that is not approved', async () => {
    const send = vi.fn();
    const result = await runDesktopBrowserCommand(request('browser_read_page'), context(send));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approved-sites list/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses when the browser has no web page open', async () => {
    approveSite();
    const result = await runDesktopBrowserCommand(request('browser_read_page'), {
      resolveTabId: () => Promise.resolve(null),
      send: vi.fn(),
      navigate: vi.fn(),
      history: vi.fn(),
      tabUrl: vi.fn(),
      capture: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No web page/);
  });

  it('reads the page as address, title and bounded text', async () => {
    approveSite();
    const send = vi.fn(async (_tabId: number, message: Record<string, unknown>) =>
      message['type'] === 'GET_PAGE_INFO'
        ? { success: true, url: `${SITE}/page`, title: 'Allowed' }
        : { success: true, text: 'x'.repeat(MAX_DESKTOP_PAGE_TEXT_CHARS + 500) },
    );
    const result = await runDesktopBrowserCommand(request('browser_read_page'), context(send));
    expect(result.ok).toBe(true);
    const value = result.value as { url: string; title: string; text: string };
    expect(value.url).toBe(`${SITE}/page`);
    expect(value.title).toBe('Allowed');
    expect(value.text.length).toBe(MAX_DESKTOP_PAGE_TEXT_CHARS);
  });

  it('redacts what the page text carries before it leaves Chrome', async () => {
    approveSite();
    const secret = 'sk-ant-api03-0123456789abcdefghijklmnopqrstuvwxyz0123456789';
    const send = vi.fn(async (_tabId: number, message: Record<string, unknown>) =>
      message['type'] === 'GET_PAGE_INFO'
        ? { success: true, url: `${SITE}/page`, title: 'Allowed' }
        : { success: true, text: `before ${secret} after` },
    );
    const result = await runDesktopBrowserCommand(request('browser_read_page'), context(send));
    const value = result.value as { text: string };
    expect(value.text).not.toContain(secret);
    expect(value.text).toContain('before');
  });

  it('captures the tab through the debugger rather than an activeTab click', async () => {
    approveSite();
    const capture = vi.fn(() => Promise.resolve('iVBORw0KGgo='));
    const result = await runDesktopBrowserCommand(request('browser_screenshot'), {
      resolveTabId: () => Promise.resolve(TAB_ID),
      send: vi.fn(),
      navigate: vi.fn(),
      history: vi.fn(),
      tabUrl: vi.fn(),
      capture,
    });
    expect(capture).toHaveBeenCalledWith(TAB_ID);
    expect((result.value as { dataUrl: string }).dataUrl).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it('falls back to the tab capture when the debugger is refused', async () => {
    approveSite();
    const send = vi.fn(async () => ({ success: true, data: 'data:image/png;base64,zzz' }));
    const result = await runDesktopBrowserCommand(request('browser_screenshot'), {
      resolveTabId: () => Promise.resolve(TAB_ID),
      send,
      navigate: vi.fn(),
      history: vi.fn(),
      tabUrl: vi.fn(),
      capture: () => Promise.reject(new Error('activeTab required')),
    });
    expect((result.value as { dataUrl: string }).dataUrl).toBe('data:image/png;base64,zzz');
  });

  it('says what to approve when neither capture path is allowed', async () => {
    approveSite();
    const result = await runDesktopBrowserCommand(request('browser_screenshot'), {
      resolveTabId: () => Promise.resolve(TAB_ID),
      send: vi.fn(async () => ({ success: false, error: 'activeTab required' })),
      navigate: vi.fn(),
      history: vi.fn(),
      tabUrl: vi.fn(),
      capture: () => Promise.reject(new Error('activeTab required')),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approve browser control/);
  });

  it('carries a click failure back as the page reported it', async () => {
    approveSite();
    const send = vi.fn(async () => ({ success: false, error: 'Element not found' }));
    const result = await runDesktopBrowserCommand(
      request('browser_click', { selector: '#buy' }),
      context(send),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Element not found');
  });

  it('needs a selector to click and an http address to navigate', async () => {
    approveSite();
    const send = vi.fn(async () => ({ success: true }));
    const navigate = vi.fn(() => Promise.resolve());

    expect((await runDesktopBrowserCommand(request('browser_click'), context(send))).error).toMatch(
      /selector/,
    );
    expect(
      (
        await runDesktopBrowserCommand(
          request('browser_navigate', { url: 'file:///etc/passwd' }),
          context(send, navigate),
        )
      ).error,
    ).toMatch(/http and https/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates the approved tab and reports the address it loaded', async () => {
    approveSite();
    const navigate = vi.fn(() => Promise.resolve());
    const result = await runDesktopBrowserCommand(
      request('browser_navigate', { url: `${SITE}/next` }),
      context(vi.fn(), navigate),
    );
    expect(result.ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith(TAB_ID, `${SITE}/next`);
  });

  it('goes back and reports the page it landed on', async () => {
    approveSite();
    const base = context(vi.fn());
    const result = await runDesktopBrowserCommand(
      request('browser_history', { direction: 'back' }),
      {
        ...base,
        tabUrl: vi.fn(() => Promise.resolve(`${SITE}/previous`)),
      },
    );
    expect(result.ok).toBe(true);
    expect(base.history).toHaveBeenCalledWith(TAB_ID, 'back');
    expect(result.value).toMatchObject({ direction: 'back', url: `${SITE}/previous` });
  });

  it('undoes a history step that lands on a site that is not approved', async () => {
    approveSite();
    const base = context(vi.fn());
    const result = await runDesktopBrowserCommand(
      request('browser_history', { direction: 'back' }),
      {
        ...base,
        tabUrl: vi.fn(() => Promise.resolve('https://collector.example/')),
      },
    );
    expect(result.ok).toBe(false);
    expect(base.history).toHaveBeenNthCalledWith(1, TAB_ID, 'back');
    expect(base.history).toHaveBeenNthCalledWith(2, TAB_ID, 'forward');
  });

  it('refuses more fields than one fill may carry', async () => {
    approveSite();
    const send = vi.fn();
    const fields = Array.from({ length: 51 }, (_, index) => ({
      selector: `#f${index}`,
      value: 'x',
    }));
    const result = await runDesktopBrowserCommand(
      request('browser_fill_form', { fields }),
      context(send),
    );
    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses to navigate an approved tab to a site that is not approved', async () => {
    approveSite();
    const navigate = vi.fn(() => Promise.resolve());
    const result = await runDesktopBrowserCommand(
      request('browser_navigate', { url: 'https://collector.example/?d=secret' }),
      context(vi.fn(), navigate),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('https://collector.example');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('passes console filters through and returns the captured entries', async () => {
    approveSite();
    const send = vi.fn(async (_tabId: number, message: Record<string, unknown>) => ({
      success: true,
      origin: SITE,
      console: [{ level: message['level'], text: 'boom' }],
    }));
    const result = await runDesktopBrowserCommand(
      request('browser_console', { level: 'error', limit: 5 }),
      context(send),
    );
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ type: 'READ_PAGE_CONSOLE', level: 'error', limit: 5 }),
    );
    expect((result.value as { console: unknown[] }).console).toHaveLength(1);
  });

  describe('under the workspace website rules', () => {
    const blockSite = { allow: [], deny: ['allowed.example'] };

    function ruled(command: string, args: Record<string, unknown> = {}) {
      return { ...request(command, args), siteRules: blockSite };
    }

    it('acts on nothing in a tab already on a blocked site', async () => {
      approveSite();
      const send = vi.fn();
      const result = await runDesktopBrowserCommand(
        ruled('browser_click', { selector: '#go' }),
        context(send),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/does not allow/);
      expect(send).not.toHaveBeenCalled();
    });

    it('goes back and withholds the result when a click lands on a blocked site', async () => {
      approveSite();
      const ctx = context(vi.fn(async () => ({ success: true })));
      ctx.tabUrl
        .mockResolvedValueOnce('https://fine.example/start')
        .mockResolvedValueOnce('https://allowed.example/landing');
      const result = await runDesktopBrowserCommand(
        ruled('browser_click', { selector: '#go' }),
        ctx,
      );
      expect(result.ok).toBe(false);
      expect(ctx.history).toHaveBeenCalledWith(TAB_ID, 'back');
    });

    it('names the page the tab is on with every result', async () => {
      approveSite();
      const result = await runDesktopBrowserCommand(
        request('browser_click', { selector: '#go' }),
        context(vi.fn(async () => ({ success: true }))),
      );
      expect(result.ok).toBe(true);
      expect(result.value).toMatchObject({ tabUrl: `${SITE}/page` });
    });
  });
});
