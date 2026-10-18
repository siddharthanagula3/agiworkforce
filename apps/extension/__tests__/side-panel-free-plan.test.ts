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
    adoptReply: (): Promise<unknown> => Promise.resolve({ success: true }),
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
        if (message.type === 'ADOPT_CHAT_TURN') return mock.adoptReply();
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
  accessReads: 0,
  tier: 'free',
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
    > => (
      (account.accessReads += 1),
      {
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
      }
    ),
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
import { saveActiveConversation } from '../src/features/background/conversation-history';

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

const usageMeters = (): Element[] =>
  [...document.querySelectorAll('[role="progressbar"]')].filter(
    (meter) => !meter.classList.contains('sp-ob-dots'),
  );

function visibleText(): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let hidden = false;
    for (let element = node.parentElement; element; element = element.parentElement) {
      if (element.hidden || element.style.display === 'none') {
        hidden = true;
        break;
      }
    }
    if (!hidden) parts.push(node.textContent ?? '');
  }
  return parts.join(' ');
}

async function refreshAs(patch: Partial<typeof account>): Promise<void> {
  Object.assign(account, patch);
  const reads = account.accessReads;
  account.onChange!();
  await vi.waitFor(() => expect(account.accessReads).toBeGreaterThan(reads));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('a Free account in the side panel', () => {
  it('sees no usage meter, percentage or plan badge, and one Upgrade action', async () => {
    await import('../src/side_panel');
    await refreshAs({ tier: 'free', sessionUsedPercent: 80, hasUsageRemaining: true });

    expect(usageMeters()).toHaveLength(0);
    expect(document.getElementById('sp-quota-badge')).toBeNull();
    expect(document.getElementById('sp-quota-bar-wrap')).toBeNull();
    expect(document.getElementById('sp-plan-compare')).toBeNull();

    expect(byId('sp-usage-warning').classList.contains('visible')).toBe(false);
    expect(visibleText()).not.toMatch(/\d+\s?%/);
  });

  it('is told it reached the Free limit, when it resets, and offered only Upgrade', async () => {
    await refreshAs({ tier: 'free', sessionUsedPercent: 100, hasUsageRemaining: false });

    expect(usageMeters()).toHaveLength(0);
    expect(document.getElementById('sp-quota-badge')).toBeNull();
    expect(byId('sp-cloud-gate-message').textContent).toMatch(
      /^You've reached the Free limit for now\. Resets in /,
    );
    expect(byId('sp-cloud-gate-action').textContent).toBe('Upgrade');
    expect(visibleText()).not.toMatch(/\d+\s?%/);

    byId('sp-cloud-gate-action').click();
    await vi.waitFor(() =>
      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/pricing'),
      }),
    );
  });

  it('leaves a paid plan its near-limit warning and the share it has used', async () => {
    await refreshAs({ tier: 'pro', sessionUsedPercent: 80, hasUsageRemaining: true });

    expect(document.getElementById('sp-quota-badge')).toBeNull();
    expect(byId('sp-usage-warning-text').textContent).toContain('80%');
  });

  it('gets no near-limit warning from a running Free reply', async () => {
    await refreshAs({ tier: 'free', sessionUsedPercent: 0, hasUsageRemaining: true });
    await saveActiveConversation(account.owner, [
      { role: 'user', content: 'Summarize', timestamp: 1_000, runtime: 'managed-cloud' },
      {
        role: 'assistant',
        content: 'The',
        timestamp: 1_001,
        runtime: 'managed-cloud',
        streaming: true,
      },
    ]);
    chromeMock.adoptReply = () =>
      Promise.resolve({ success: true, adopted: { id: 'stream-free', text: 'The' } });
    chromeMock.runtime.sendMessage.mockClear();
    account.owner = { ...account.owner, authIncarnation: 'session-adopt' };
    account.onChange!();
    const adopt = await vi.waitFor(() => {
      const request = chromeMock.runtime.sendMessage.mock.calls
        .map(([message]) => message as Record<string, unknown>)
        .find((message) => message['type'] === 'ADOPT_CHAT_TURN');
      expect(request).toBeDefined();
      return request!;
    });
    await vi.waitFor(() => expect(byId('sp-send-btn').getAttribute('data-mode')).toBe('stop'));

    for (const listener of chromeMock.messageListeners)
      listener(
        {
          type: 'CHAT_CHUNK',
          owner: account.owner,
          clientInstanceId: adopt['clientInstanceId'],
          id: 'stream-free',
          text: ' report',
          quotaWarning: { scope: 'rolling_five_hour', usedPercent: 92 },
        },
        { id: 'test-extension', url: 'chrome-extension://test/side_panel.html' },
      );
    await vi.waitFor(() => expect(byId('sp-messages').textContent).toContain('The report'));

    expect(byId('sp-usage-warning').classList.contains('visible')).toBe(false);
    expect(byId('sp-usage-warning-text').textContent).toBe('');
  });
});
