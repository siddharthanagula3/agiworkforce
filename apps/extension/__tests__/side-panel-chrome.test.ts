/**
 * The panel chrome: a compact top bar, a conversation title row with an
 * actions menu, and a small More popover that replaced the full-height drawer.
 * These tests mount the real `buildUI()` and drive the real listeners.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../src/features/cloud-bridge/clerkAuth');
type ScanModule1 = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ScanModule2 = typeof import('../src/features/cloud-bridge/capabilityDocument');

const chromeMock = vi.hoisted(() => {
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() });
  const area = () => {
    const values: Record<string, unknown> = {};
    return {
      get: vi.fn(
        async (
          keys: string | string[] | null,
          callback?: (result: Record<string, unknown>) => void,
        ) => {
          const names =
            keys === null ? Object.keys(values) : typeof keys === 'string' ? [keys] : keys;
          const result = Object.fromEntries(
            names.filter((key) => key in values).map((key) => [key, structuredClone(values[key])]),
          );
          callback?.(result);
          return result;
        },
      ),
      set: vi.fn(async (items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(values, structuredClone(items));
        callback?.();
      }),
      remove: vi.fn(async (keys: string | string[], callback?: () => void) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
        callback?.();
      }),
    };
  };
  const mock = {
    sent: [] as Array<{ type?: string } & Record<string, unknown>>,
    runtime: {
      id: 'test-extension',
      onMessage: event(),
      onConnect: event(),
      connect: vi.fn(() => ({
        onMessage: event(),
        onDisconnect: event(),
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
      sendMessage: vi.fn(
        (message: { type?: string } & Record<string, unknown>, callback?: (r: unknown) => void) => {
          mock.sent.push(message);
          const response = { success: true };
          callback?.(response);
          return Promise.resolve(response);
        },
      ),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
      openOptionsPage: vi.fn(),
      lastError: undefined as { message: string } | undefined,
    },
    storage: {
      local: area(),
      session: { ...area(), onChanged: event() },
      sync: area(),
      onChanged: event(),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
      create: vi.fn(),
      onActivated: event(),
      onUpdated: event(),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    commands: { getAll: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true) },
    action: { onClicked: event() },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
    i18n: {
      getMessage: vi.fn((key: string, substitutions: string[] = []) =>
        catalogMessage(key, substitutions),
      ),
      getUILanguage: vi.fn(() => 'en'),
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 503 })),
  );
  return mock;
});

const account = vi.hoisted(() => ({
  owner: { accountId: 'account-fixture', authIncarnation: 'session-fixture' },
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () => ({ token: 'fixture-session', owner: account.owner }),
  getFreshClerkToken: async () => 'fixture-session',
  observeClerkAuth: async () => () => undefined,
}));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return {
    ...actual,
    getManagedModelAccess: async (): Promise<
      import('../src/features/cloud-bridge/freeTrialClient').ManagedModelAccess
    > => ({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      modelIds: [],
      allowedAutoModes: [],
      usage: parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 0,
        usage_reset_at: null,
        period_start: null,
        period_end: null,
        session_usage_percentage: 0,
        session_reset_at: null,
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
        has_usage_remaining: true,
        usage_allocation: 'provisioned',
        subscription_status: 'active',
      }),
    }),
  };
});
vi.mock('../src/features/cloud-bridge/capabilityDocument', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  fetchAccountSummary: async () => ({
    displayName: account.owner.authIncarnation,
    email: null,
    planName: 'Pro',
    planTier: 'pro',
    greetingName: 'Ada Lovelace',
    capabilityDocument: {
      granted: [],
      deniedBy: {},
      sources: {
        model: 'fixture-model',
        tier: 'fixture-tier',
        surface: 'fixture-surface',
        settings: 'fixture-settings',
      },
    },
  }),
}));
import { parseManagedUsageSummaryResponse } from '@agiworkforce/types';
import {
  deleteConversation,
  getConversation,
  recordCloudSyncState,
  saveConversation,
} from '../src/features/background/conversation-history';
import { optionsDestinations } from '../src/features/options/destinations';
import catalog from '../_locales/en/messages.json';
import '../src/side_panel';

function catalogMessage(key: string, substitutions: string[]): string {
  const entry = (
    catalog as Record<
      string,
      { message: string; placeholders?: Record<string, { content: string }> }
    >
  )[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

const byId = (id: string): HTMLElement | null => document.getElementById(id);

function moreMenu(): HTMLElement {
  const menu = byId('sp-more-menu');
  if (!menu) throw new Error('the More popover was never built');
  return menu;
}

function menuLabels(menu: HTMLElement): string[] {
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent?.trim() ?? '',
  );
}

function accountMenuLabels(): string[] {
  return ['spAccountSettings', 'spAccountUsage', 'spAccountUpgrade', 'spAccountLogOut'].map((key) =>
    catalogMessage(key, []),
  );
}

function panelMenuLabels(menu: HTMLElement): string[] {
  const account = accountMenuLabels();
  return menuLabels(menu).filter((label) => !account.includes(label));
}

async function openSavedConversation(content: string): Promise<string> {
  const conversationId = await saveConversation(account.owner, [
    { role: 'user', content, timestamp: Date.now(), runtime: 'managed-cloud' },
  ]);
  byId('sp-history-btn')!.click();
  let restore!: HTMLButtonElement;
  await vi.waitFor(() => {
    restore = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-conversation-restore="true"]'),
    ).find((button) => button.textContent?.includes(content))!;
    expect(restore).toBeDefined();
  });
  restore.click();
  await vi.waitFor(() => expect(byId('sp-messages')!.textContent).toContain(content));
  return conversationId;
}

function openTitleMenu(): HTMLElement {
  const trigger = byId('sp-title-menu-btn');
  if (!trigger) throw new Error('the title menu trigger was never built');
  trigger.click();
  const menu = byId('sp-title-menu');
  if (!menu) throw new Error('the title menu was never built');
  return menu;
}

function titleMenuItem(label: string): HTMLButtonElement {
  const item = Array.from(
    byId('sp-title-menu')!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ).find((candidate) => candidate.textContent?.trim() === label);
  if (!item) throw new Error(`title menu has no "${label}" item`);
  return item;
}

beforeEach(async () => {
  byId('sp-new-chat-btn')!.click();
  chromeMock.sent.length = 0;
  chromeMock.tabs.create.mockClear();
  chromeMock.runtime.openOptionsPage.mockClear();
  byId('sp-title-menu')?.setAttribute('hidden', '');
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await vi.waitFor(() => expect((byId('sp-input') as HTMLTextAreaElement).disabled).toBe(false));
});

describe('top bar', () => {
  it('shows History, New chat and More with no plan badge, drawer or view tabs', () => {
    const right = byId('sp-header-right')!;
    const buttons = Array.from(right.querySelectorAll('button')).map((button) => button.id);
    expect(buttons).toEqual(
      expect.arrayContaining(['sp-history-btn', 'sp-new-chat-btn', 'sp-menu-btn']),
    );
    expect(byId('sp-quota-badge')).toBeNull();
    expect(byId('sp-quota-badge-slot')).toBeNull();
    expect(byId('sp-drawer')).toBeNull();
    expect(byId('sp-drawer-overlay')).toBeNull();
    expect(byId('sp-workflows')).toBeNull();
    expect(byId('sp-tab-workflows')).toBeNull();
    expect(byId('sp-tab-cloud-runs')).toBeNull();
    expect(byId('sp-tab-page')).toBeNull();
  });
});

describe('side panel presence', () => {
  it('announces its window to the background so the in-page launcher can hide', async () => {
    const connection = chromeMock.runtime.connect.mock.calls.find(
      ([options]) => (options as { name?: string }).name === 'agi-side-panel',
    );
    expect(connection).toBeDefined();
    const port = chromeMock.runtime.connect.mock.results[
      chromeMock.runtime.connect.mock.calls.indexOf(connection!)
    ]!.value as { postMessage: ReturnType<typeof vi.fn> };
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ windowId: 1 }));
  });
});

describe('More popover', () => {
  it('is a small role=menu with three or four panel rows and the version footer', () => {
    byId('sp-menu-btn')!.click();
    const menu = moreMenu();
    expect(menu.hidden).toBe(false);
    expect(menu.getAttribute('role')).toBe('menu');
    expect(byId('sp-menu-btn')!.getAttribute('aria-expanded')).toBe('true');
    const labels = panelMenuLabels(menu);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.length).toBeLessThanOrEqual(4);
    expect(labels).toContain(catalogMessage('spExtensionSettings', []));
    expect(menu.querySelector('.sp-more-footer')?.textContent).toContain('v1.2.0');
  });

  it('greets the account by first name in the empty state, like web', async () => {
    await vi.waitFor(() => {
      const greeting = byId('sp-empty-greeting')!;
      expect(greeting.hidden).toBe(false);
      expect(greeting.textContent).toContain('Ada');
      expect(greeting.textContent).not.toContain('Lovelace');
    });
  });

  it('names the signed-in account and plan like the web account menu', async () => {
    await vi.waitFor(() => {
      byId('sp-menu-btn')!.click();
      const header = moreMenu().querySelector('.sp-more-account-header');
      expect(header?.textContent).toContain('Pro');
      expect(header?.textContent).toContain(account.owner.authIncarnation);
    });
    expect(menuLabels(moreMenu())).toEqual(expect.arrayContaining(accountMenuLabels()));
    chromeMock.tabs.create.mockClear();
    Array.from(moreMenu().querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.trim() === catalogMessage('spAccountUsage', []))!
      .click();
    expect((chromeMock.tabs.create.mock.calls[0]![0] as { url: string }).url).toContain(
      '/settings/usage?from=chrome-extension',
    );
  });

  it('moves focus with arrow keys, closes on Escape and returns focus to the trigger', () => {
    byId('sp-menu-btn')!.click();
    const menu = moreMenu();
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);
    items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(byId('sp-menu-btn'));
  });

  it('closes on an outside pointer press', () => {
    byId('sp-menu-btn')!.click();
    byId('sp-messages')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(moreMenu().hidden).toBe(true);
  });

  it('links Extension settings, Shortcuts and Help to Options destinations', () => {
    const targets = optionsDestinations().map((destination) => destination.target);
    byId('sp-menu-btn')!.click();
    const open = (label: string): string => {
      chromeMock.tabs.create.mockClear();
      Array.from(moreMenu().querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((item) => item.textContent?.trim() === label)!
        .click();
      const url = (chromeMock.tabs.create.mock.calls[0]![0] as { url: string }).url;
      return url;
    };
    const settings = open(catalogMessage('spExtensionSettings', []));
    expect(settings).toBe(`chrome-extension://test/src/options.html#opt-permissions`);
    expect(targets).toContain('opt-permissions');
    byId('sp-menu-btn')!.click();
    const shortcuts = open(catalogMessage('spMoreShortcuts', []));
    expect(shortcuts).toBe(`chrome-extension://test/src/options.html#opt-shortcuts`);
    expect(targets).toContain('opt-shortcuts');
    byId('sp-menu-btn')!.click();
    open(catalogMessage('spMoreHelp', []));
    expect(chromeMock.tabs.create).toHaveBeenCalledOnce();
    expect(moreMenu().hidden).toBe(true);
  });
});

describe('More popover Open in web', () => {
  it('opens the current account chat on the web and is absent for a device-only chat', async () => {
    const content = 'Open in web fixture question';
    const conversationId = await saveConversation(account.owner, [
      { role: 'user', content, timestamp: Date.now(), runtime: 'managed-cloud' },
    ]);
    const cloudId = '8b1c1f0e-6a42-4c55-9a41-2f3f6f2f6a11';
    await recordCloudSyncState(account.owner, conversationId, {
      conversationId: cloudId,
      organizationId: null,
    });
    try {
      byId('sp-history-btn')!.click();
      await vi.waitFor(() => {
        const restore = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-conversation-restore="true"]'),
        ).find((button) => button.textContent?.includes(content));
        expect(restore).toBeDefined();
        restore!.click();
      });
      await vi.waitFor(() => expect(byId('sp-title-row')!.hidden).toBe(false));
      await vi.waitFor(() =>
        expect(byId('sp-title-menu')?.textContent).toContain(
          catalogMessage('spHistoryArchive', []),
        ),
      );
      byId('sp-menu-btn')!.click();
      const open = Array.from(
        moreMenu().querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ).find((item) => item.textContent?.trim() === catalogMessage('spHistoryOpenInWeb', []))!;
      expect(open).toBeDefined();
      expect(panelMenuLabels(moreMenu()).length).toBeLessThanOrEqual(4);
      open.click();
      expect((chromeMock.tabs.create.mock.calls[0]![0] as { url: string }).url).toContain(
        `/chat/${cloudId}`,
      );
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });
});

describe('conversation title row', () => {
  it('is hidden until a conversation exists, then names it with an actions menu', async () => {
    expect(byId('sp-title-row')!.hidden).toBe(true);
    const conversationId = await openSavedConversation('Title row fixture question');
    try {
      expect(byId('sp-title-row')!.hidden).toBe(false);
      expect(byId('sp-title-text')!.textContent).toContain('Title row fixture question');
      const menu = openTitleMenu();
      expect(menu.getAttribute('role')).toBe('menu');
      const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) =>
        item.textContent?.trim(),
      );
      expect(labels).toEqual(
        expect.arrayContaining([
          catalogMessage('spTitleSchedule', []),
          catalogMessage('spHistoryRename', []),
          catalogMessage('spHistoryStar', []),
          catalogMessage('spTitleAddToProject', []),
          catalogMessage('spHistoryDelete', []),
        ]),
      );
      expect(byId('sp-quota-badge')).toBeNull();
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });

  it('renames the open conversation and keeps the new title', async () => {
    const conversationId = await openSavedConversation('Rename fixture question');
    try {
      openTitleMenu();
      titleMenuItem(catalogMessage('spHistoryRename', [])).click();
      const input = document.querySelector<HTMLInputElement>('#sp-title-row input')!;
      expect(input.value).toContain('Rename fixture question');
      input.value = 'Renamed from the title row';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.waitFor(async () => {
        const stored = await getConversation(account.owner, conversationId);
        expect(stored?.customTitle).toBe('Renamed from the title row');
      });
      await vi.waitFor(() =>
        expect(byId('sp-title-text')!.textContent).toBe('Renamed from the title row'),
      );
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });

  it('stars the open conversation', async () => {
    const conversationId = await openSavedConversation('Star fixture question');
    try {
      openTitleMenu();
      titleMenuItem(catalogMessage('spHistoryStar', [])).click();
      await vi.waitFor(async () => {
        expect((await getConversation(account.owner, conversationId))?.starred).toBe(true);
      });
      await vi.waitFor(() => {
        openTitleMenu();
        expect(titleMenuItem(catalogMessage('spHistoryUnstar', []))).toBeDefined();
      });
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });

  it('asks before deleting, names the consequence, and deletes only after confirmation', async () => {
    const conversationId = await openSavedConversation('Delete fixture question');
    try {
      openTitleMenu();
      titleMenuItem(catalogMessage('spHistoryDelete', [])).click();
      const confirm = document.querySelector<HTMLElement>('#sp-title-row [role="alertdialog"]')!;
      expect(confirm.textContent).toContain(catalogMessage('spHistoryDeleteConfirmDevice', []));
      expect(await getConversation(account.owner, conversationId)).toBeDefined();
      Array.from(confirm.querySelectorAll('button'))
        .find((button) => button.textContent === catalogMessage('spHistoryCancel', []))!
        .click();
      expect(await getConversation(account.owner, conversationId)).toBeDefined();
      openTitleMenu();
      titleMenuItem(catalogMessage('spHistoryDelete', [])).click();
      document.querySelector<HTMLElement>('#sp-title-row [role="alertdialog"] .is-danger')!.click();
      await vi.waitFor(async () => {
        expect(await getConversation(account.owner, conversationId)).toBeUndefined();
      });
      await vi.waitFor(() => expect(byId('sp-title-row')!.hidden).toBe(true));
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });

  it('asks before archiving an account chat and archives only after confirmation', async () => {
    const content = 'Archive fixture question';
    const conversationId = await saveConversation(account.owner, [
      { role: 'user', content, timestamp: Date.now(), runtime: 'managed-cloud' },
    ]);
    await recordCloudSyncState(account.owner, conversationId, {
      conversationId: '4d1c1f0e-6a42-4c55-9a41-2f3f6f2f6a10',
      organizationId: null,
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    try {
      byId('sp-history-btn')!.click();
      await vi.waitFor(() => {
        const restore = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-conversation-restore="true"]'),
        ).find((button) => button.textContent?.includes(content));
        expect(restore).toBeDefined();
        restore!.click();
      });
      await vi.waitFor(() => expect(byId('sp-title-row')!.hidden).toBe(false));
      await vi.waitFor(() =>
        expect(byId('sp-title-menu')?.textContent).toContain(
          catalogMessage('spHistoryArchive', []),
        ),
      );
      fetchMock.mockClear();
      titleMenuItem(catalogMessage('spHistoryArchive', [])).click();
      const confirm = document.querySelector<HTMLElement>('#sp-title-row [role="alertdialog"]')!;
      expect(confirm.textContent).toContain(catalogMessage('spHistoryArchiveConfirm', []));
      Array.from(confirm.querySelectorAll('button'))
        .find((button) => button.textContent === catalogMessage('spHistoryCancel', []))!
        .click();
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await getConversation(account.owner, conversationId))?.archived).not.toBe(true);
      openTitleMenu();
      titleMenuItem(catalogMessage('spHistoryArchive', [])).click();
      document.querySelector<HTMLElement>('#sp-title-row [role="alertdialog"] button')!.click();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });

  it('offers Schedule and hands the first prompt to Options shortcuts', async () => {
    const conversationId = await openSavedConversation('Schedule fixture question');
    try {
      openTitleMenu();
      titleMenuItem(catalogMessage('spTitleSchedule', [])).click();
      await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalled());
      expect((chromeMock.tabs.create.mock.calls[0]![0] as { url: string }).url).toBe(
        'chrome-extension://test/src/options.html#opt-shortcuts',
      );
      const stored = await chromeMock.storage.session.get('agi_schedule_draft');
      expect(stored['agi_schedule_draft']).toMatchObject({
        prompt: 'Schedule fixture question',
      });
    } finally {
      await deleteConversation(account.owner, conversationId);
    }
  });
});
