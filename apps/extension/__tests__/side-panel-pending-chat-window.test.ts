// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
type ClerkAuthModule = typeof import('../src/features/cloud-bridge/clerkAuth');
type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');
type CapabilityDocumentModule = typeof import('../src/features/cloud-bridge/capabilityDocument');

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
  const messageListeners: Array<(message: unknown, sender: { id: string; url: string }) => void> =
    [];
  const mock = {
    messageListeners,
    runtime: {
      id: 'test-extension',
      onMessage: {
        ...event(),
        addListener: vi.fn((listener: (typeof messageListeners)[number]) =>
          messageListeners.push(listener),
        ),
      },
      onConnect: event(),
      connect: vi.fn(() => ({
        onMessage: event(),
        onDisconnect: event(),
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
      sendMessage: vi.fn((message: { type?: string }, callback?: (response: unknown) => void) => {
        const response =
          message.type === 'LIST_SCHEDULED_TASKS'
            ? { success: true, tasks: [] }
            : { success: true };
        callback?.(response);
        return Promise.resolve(response);
      }),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
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
      create: vi.fn(async () => ({})),
      onActivated: event(),
      onUpdated: event(),
    },
    scripting: {
      executeScript: vi.fn(async (): Promise<unknown[]> => []),
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
  tier: 'pro',
  sessionUsedPercent: 0,
  hasUsageRemaining: true,
  onChange: undefined as (() => void) | undefined,
  owner: { accountId: 'account-fixture', authIncarnation: 'session-fixture' },
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ClerkAuthModule>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () => ({ token: 'fixture-session', owner: account.owner }),
  getFreshClerkToken: async () => 'fixture-session',
  observeClerkAuth: async (onChange: () => void) => {
    account.onChange = onChange;
    return () => undefined;
  },
}));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => {
  const actual = await importOriginal<FreeTrialClientModule>();
  return {
    ...actual,
    getManagedModelAccess: async (): Promise<
      import('../src/features/cloud-bridge/freeTrialClient').ManagedModelAccess
    > => ({
      subscriptionTier: account.tier,
      subscriptionStatus: 'active',
      modelIds: [],
      allowedAutoModes: [],
      usage: parseManagedUsageSummaryResponse({
        plan_tier: account.tier,
        usage_percentage: 0,
        usage_reset_at: null,
        period_start: null,
        period_end: null,
        session_usage_percentage: account.sessionUsedPercent,
        session_reset_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
        has_usage_remaining: account.hasUsageRemaining,
        usage_allocation: 'provisioned',
        subscription_status: 'active',
      }),
    }),
  };
});
vi.mock('../src/features/cloud-bridge/capabilityDocument', async (importOriginal) => ({
  ...(await importOriginal<CapabilityDocumentModule>()),
  fetchAccountSummary: async () => ({
    displayName: 'Fixture',
    email: null,
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

import catalog from '../_locales/en/messages.json';

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

const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

const PAGE_TAB = {
  id: 7,
  windowId: 1,
  url: 'https://example.com/guide',
  title: 'Guide',
  status: 'complete',
};

function chatMessages(): Array<Record<string, unknown>> {
  return chromeMock.runtime.sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message['type'] === 'CHAT_MESSAGE');
}

async function deliverPendingChat(record: Record<string, unknown>): Promise<void> {
  await chromeMock.storage.session.set({ agi_pending_chat: record });
  for (const [listener] of chromeMock.storage.onChanged.addListener.mock.calls)
    (listener as (changes: Record<string, unknown>, area: string) => void)(
      { agi_pending_chat: { newValue: record } },
      'session',
    );
}

describe('a context-menu request made in another window', () => {
  it('is left alone by a side panel that belongs to a different window', async () => {
    await import('../src/side_panel');
    await vi.waitFor(() => expect((byId('sp-input') as HTMLTextAreaElement).disabled).toBe(false));
    chromeMock.tabs.query.mockImplementation(async () => [PAGE_TAB] as never[]);
    chromeMock.runtime.sendMessage.mockClear();

    await deliverPendingChat({
      type: 'explain',
      text: 'text selected in the other window',
      url: 'https://other.example/',
      tabId: 99,
      windowId: 2,
      timestamp: Date.now(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chatMessages()).toHaveLength(0);
    const stored = await chromeMock.storage.session.get('agi_pending_chat');
    expect(stored['agi_pending_chat']).toBeDefined();
  });

  it('is handled by the side panel of the window it was made in', async () => {
    await deliverPendingChat({
      type: 'explain',
      text: 'text selected in this window',
      url: PAGE_TAB.url,
      tabId: PAGE_TAB.id,
      windowId: 1,
      timestamp: Date.now(),
    });

    await vi.waitFor(() => expect(chatMessages()).toHaveLength(1));
    expect(String(chatMessages()[0]!['text'])).toContain('text selected in this window');
  });

  describe('summarizing the page', () => {
    function readablePage(): void {
      chromeMock.tabs.query.mockImplementation(async () => [PAGE_TAB] as never[]);
      Object.assign(chromeMock.tabs, {
        get: vi.fn(async () => PAGE_TAB),
        sendMessage: vi.fn(async () => ({
          success: true,
          text: 'The body of the guide page.',
          truncated: false,
        })),
      });
      chromeMock.scripting.executeScript.mockImplementation(async () => [
        { documentId: 'document-1', result: PAGE_TAB.url },
      ]);
    }

    async function summarize(tabId: number): Promise<void> {
      document.getElementById('sp-new-chat-btn')!.click();
      readablePage();
      chromeMock.runtime.sendMessage.mockClear();
      await deliverPendingChat({
        type: 'summarize',
        text: '',
        url: PAGE_TAB.url,
        tabId,
        windowId: 1,
        timestamp: Date.now(),
      });
    }

    it('summarizes the tab the menu was used on', async () => {
      await summarize(PAGE_TAB.id);
      await vi.waitFor(() => expect(chatMessages()).toHaveLength(1));
      expect(chatMessages()[0]!['pageContext']).toBe('The body of the guide page.');
    });

    it('does not summarize a different tab than the one the menu was used on', async () => {
      await summarize(99);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(chatMessages()).toHaveLength(0);
    });
  });
});
