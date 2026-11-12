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
  failure: null as Error | null,
  sessionGone: false,
  endSessionOnRead: false,
  onChange: undefined as (() => void) | undefined,
  owner: { accountId: 'account-fixture', authIncarnation: 'session-fixture' },
  clearedTokens: 0,
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ClerkAuthModule>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () =>
    account.sessionGone ? null : { token: 'fixture-session', owner: account.owner },
  getFreshClerkToken: async () => (account.sessionGone ? null : 'fixture-session'),
  observeClerkAuth: async (onChange: () => void) => {
    account.onChange = onChange;
    return () => undefined;
  },
}));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => {
  const actual = await importOriginal<FreeTrialClientModule>();
  return {
    ...actual,
    clearAuthToken: async () => {
      account.clearedTokens += 1;
    },
    getManagedModelAccess: async (): Promise<
      import('../src/features/cloud-bridge/freeTrialClient').ManagedModelAccess
    > => {
      account.accessReads += 1;
      if (account.endSessionOnRead) account.sessionGone = true;
      if (account.failure) throw account.failure;
      return {
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        modelIds: [],
        allowedAutoModes: [],
        usage: null,
      } as unknown as import('../src/features/cloud-bridge/freeTrialClient').ManagedModelAccess;
    },
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
import {
  ManagedAccessAuthRequiredError,
  ManagedAccessRefusedError,
  ManagedAccessUnavailableError,
} from '../src/features/cloud-bridge/freeTrialClient';

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

async function refreshWith(failure: Error | null): Promise<void> {
  account.failure = failure;
  account.sessionGone = false;
  const reads = account.accessReads;
  account.onChange!();
  await vi.waitFor(() => expect(account.accessReads).toBeGreaterThan(reads));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('a failed account read in the side panel', () => {
  it('shows a workspace policy refusal as the server worded it, and keeps the session', async () => {
    await import('../src/side_panel');
    await refreshWith(
      new ManagedAccessRefusedError(
        'This workspace is locked down while an incident is investigated. Contact support.',
      ),
    );

    expect(byId('sp-cloud-gate-message').textContent).toBe(
      'This workspace is locked down while an incident is investigated. Contact support.',
    );
    expect(account.clearedTokens).toBe(0);
  });

  it('offers a retry for a slow or unavailable server, and keeps the session', async () => {
    await refreshWith(new Error('Account access is unavailable (503)'));

    expect(byId('sp-cloud-gate-message').textContent).toBe(
      catalogMessage('spGateVerifyFailed', []),
    );
    expect(byId('sp-cloud-gate-action').textContent).toBe(catalogMessage('spGateRetry', []));
    expect(account.clearedTokens).toBe(0);
  });

  it('offers the plans for a plan refusal instead of a retry', async () => {
    await refreshWith(
      new ManagedAccessRefusedError('Your plan does not include this. Upgrade to use it.', 'plan'),
    );

    expect(byId('sp-cloud-gate-message').textContent).toBe(
      'Your plan does not include this. Upgrade to use it.',
    );
    expect(byId('sp-cloud-gate-action').textContent).toBe(catalogMessage('spGateViewPlans', []));
    expect(account.clearedTokens).toBe(0);
  });

  it('reads the account again on its own once the server said it could', async () => {
    await refreshWith(new ManagedAccessUnavailableError(1));
    const reads = account.accessReads;
    account.failure = null;

    expect(byId('sp-cloud-gate-action').textContent).toBe(catalogMessage('spGateRetry', []));
    await vi.waitFor(() => expect(account.accessReads).toBeGreaterThan(reads), {
      timeout: 3_000,
    });
    expect(account.clearedTokens).toBe(0);
  });

  it('does not sign out on a refused request while the session still renews', async () => {
    await refreshWith(new ManagedAccessAuthRequiredError());

    expect(account.clearedTokens).toBe(0);
    expect(byId('sp-cloud-gate-message').textContent).not.toBe(
      catalogMessage('spCloudSessionExpired', []),
    );
  });

  it('signs out only once the session itself cannot be renewed', async () => {
    account.endSessionOnRead = true;
    await refreshWith(new ManagedAccessAuthRequiredError());

    expect(account.clearedTokens).toBe(1);
    expect(byId('sp-cloud-gate-message').textContent).toBe(
      catalogMessage('spCloudSessionExpired', []),
    );
  });
});
