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
  getClerkAccountProfile: async () => null,
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
    getManagedUsageHistory: async () => null,
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

const TAB = {
  id: 7,
  windowId: 1,
  url: 'https://example.com/guide',
  title: 'Guide',
  status: 'complete',
};

function offerSelection(text: string | null): void {
  chromeMock.tabs.query.mockImplementation(async () => [TAB] as never[]);
  chromeMock.scripting.executeScript.mockImplementation(async () => [
    { result: text === null ? null : { text, truncated: false } },
  ]);
}

const selectionChip = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.sp-attachment-selection');

function chatMessages(): Array<Record<string, unknown>> {
  return chromeMock.runtime.sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message['type'] === 'CHAT_MESSAGE');
}

describe('a highlighted passage on the active tab', () => {
  it('appears as a chip, and only that passage is sent with the message', async () => {
    await import('../src/side_panel');
    await vi.waitFor(() => expect((byId('sp-input') as HTMLTextAreaElement).disabled).toBe(false));
    offerSelection('Revenue grew 12% in the third quarter.');

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(selectionChip()).not.toBeNull());
    expect(selectionChip()!.textContent).toContain('Selected text · example.com');
    expect(selectionChip()!.textContent).toContain('Revenue grew 12% in the third quarter.');
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 } }),
    );

    const input = byId('sp-input') as HTMLTextAreaElement;
    input.value = 'Summarize this';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    byId('sp-send-btn').click();

    await vi.waitFor(() => expect(chatMessages()).toHaveLength(1));
    expect(chatMessages()[0]!['pageContext']).toBe('Revenue grew 12% in the third quarter.');
    expect(selectionChip()).toBeNull();
    await vi.waitFor(() =>
      expect(byId('sp-messages').textContent).toContain('Selected text · example.com'),
    );

    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selectionChip()).toBeNull();
  });

  it('can be dismissed, and is not offered again for the same passage', async () => {
    document.getElementById('sp-new-chat-btn')!.click();
    offerSelection('A different passage.');
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(selectionChip()).not.toBeNull());

    selectionChip()!.querySelector<HTMLButtonElement>('.sp-attachment-remove')!.click();
    expect(selectionChip()).toBeNull();

    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selectionChip()).toBeNull();
  });

  it('shows nothing when the page has no readable selection', async () => {
    offerSelection(null);
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selectionChip()).toBeNull();

    chromeMock.scripting.executeScript.mockImplementation(async () => {
      throw new Error('Cannot access contents of the page.');
    });
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selectionChip()).toBeNull();
  });
});
