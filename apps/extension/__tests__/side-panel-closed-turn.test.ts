// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../src/features/cloud-bridge/clerkAuth');
type ScanModule1 = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ScanModule2 = typeof import('../src/features/cloud-bridge/capabilityDocument');

const chromeMock = vi.hoisted(() => {
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });
  const messageListeners: Array<(message: unknown, sender: { id: string; url: string }) => void> =
    [];
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
    messageListeners,
    cancellationReply: undefined as (() => Promise<unknown>) | undefined,
    adoptReply: (_message: Record<string, unknown>): Promise<unknown> =>
      Promise.resolve({ success: true }),
    screenshotDataUrl: '' as string,
    screenshotError: '' as string,
    deferScreenshots: false,
    screenshotReplies: [] as Array<
      (response: { success: boolean; data?: string; error?: string }) => void
    >,
    taskCallback: undefined as ((response: unknown) => void) | undefined,
    tasks: [] as Array<Record<string, unknown>>,
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
        if (message.type === 'CANCEL_STREAM' && mock.cancellationReply)
          return mock.cancellationReply();
        if (message.type === 'ADOPT_CHAT_TURN')
          return mock.adoptReply(message as Record<string, unknown>);
        if (message?.type === 'CAPTURE_SCREENSHOT') {
          if (mock.deferScreenshots)
            return new Promise((resolve) => {
              mock.screenshotReplies.push((response) => {
                callback?.(response);
                resolve(response);
              });
            });
          const response = mock.screenshotError
            ? { success: false, error: mock.screenshotError }
            : { success: true, data: mock.screenshotDataUrl };
          callback?.(response);
          return Promise.resolve(response);
        }
        if (message.type === 'CREATE_SCHEDULED_TASK' || message.type === 'UPDATE_SCHEDULED_TASK') {
          mock.taskCallback = callback;
          return Promise.resolve(undefined);
        }
        const response =
          message.type === 'LIST_SCHEDULED_TASKS'
            ? { success: true, tasks: mock.tasks }
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
  signedIn: true,
  uploadsAllowed: true,
  ready: true,
  modelIds: [] as string[],
  onChange: undefined as (() => void) | undefined,
  owner: { accountId: 'account-fixture', authIncarnation: 'session-fixture' },
  revoke: vi.fn(async (): Promise<void> => undefined),
  signOut: vi.fn(async (): Promise<void> => {
    account.signedIn = false;
  }),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () =>
    account.signedIn ? { token: 'fixture-session', owner: account.owner } : null,
  getFreshClerkToken: async () => (account.signedIn ? 'fixture-session' : null),
  getClerkAccountProfile: async () => null,
  observeClerkAuth: async (onChange: () => void) => {
    account.onChange = onChange;
    return () => undefined;
  },
  revokeSyncedWebSession: () => account.revoke(),
  signOutClerk: () => account.signOut(),
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
      modelIds: account.modelIds,
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
        usage_allocation: account.ready ? 'provisioned' : 'pending',
        subscription_status: 'active',
      }),
    }),
    getManagedUsageHistory: async () => null,
  };
});
vi.mock('../src/features/cloud-bridge/capabilityDocument', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  fetchAccountSummary: async () => ({
    displayName: account.owner.authIncarnation,
    email: null,
    capabilityDocument: {
      granted: account.uploadsAllowed ? ['canUploadFiles'] : [],
      deniedBy: account.uploadsAllowed ? {} : { canUploadFiles: ['settings'] },
      sources: {
        model: 'fixture-model',
        tier: 'fixture-tier',
        surface: 'fixture-surface',
        settings: 'fixture-settings',
      },
    },
  }),
}));
import { getRoutingSlotModel, parseManagedUsageSummaryResponse } from '@agiworkforce/types';

import catalog from '../_locales/en/messages.json';
import {
  getConversation,
  saveActiveConversation,
  settleDetachedAssistantTurn,
} from '../src/features/background/conversation-history';

const OWNER = { accountId: 'account-fixture', authIncarnation: 'session-fixture' };

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

const sendButton = (): HTMLButtonElement =>
  document.getElementById('sp-send-btn') as HTMLButtonElement;

function adoptRequests(): Array<Record<string, unknown>> {
  return chromeMock.runtime.sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message['type'] === 'ADOPT_CHAT_TURN');
}

function transcriptText(): string {
  return document.getElementById('sp-messages')?.textContent ?? '';
}

function chunk(clientInstanceId: unknown, patch: Record<string, unknown>): void {
  for (const listener of chromeMock.messageListeners)
    listener(
      { type: 'CHAT_CHUNK', owner: OWNER, clientInstanceId, id: 'stream-closed-panel', ...patch },
      { id: 'test-extension', url: 'chrome-extension://test/side_panel.html' },
    );
}

describe('reopening the side panel during a turn that kept running', () => {
  it('shows the still-running reply and keeps receiving it until it finishes', async () => {
    await saveActiveConversation(OWNER, [
      { role: 'user', content: 'Summarize the report', timestamp: 1_000, runtime: 'managed-cloud' },
      {
        role: 'assistant',
        content: 'The report',
        timestamp: 1_001,
        runtime: 'managed-cloud',
        streaming: true,
      },
    ]);
    chromeMock.adoptReply = () =>
      Promise.resolve({
        success: true,
        adopted: { id: 'stream-closed-panel', text: 'The report shows' },
      });

    await import('../src/side_panel');

    await vi.waitFor(() => expect(adoptRequests()).toHaveLength(1));
    const request = adoptRequests()[0]!;
    expect(request).toMatchObject({ owner: OWNER, historyConversationId: expect.any(String) });
    await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('stop'));
    expect(transcriptText()).toContain('The report shows');

    chunk(request['clientInstanceId'], { text: ' growth.' });
    chunk(request['clientInstanceId'], { text: '', done: true });

    await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('send'));
    expect(transcriptText()).toContain('The report shows growth.');
    await vi.waitFor(async () => {
      const entry = await getConversation(OWNER, request['historyConversationId'] as string);
      const last = entry?.messages[entry.messages.length - 1];
      expect(last).toMatchObject({ role: 'assistant', content: 'The report shows growth.' });
      expect(last?.streaming).toBeUndefined();
    });
  });
});

describe('reopening the side panel after a closed-panel turn finished', () => {
  it('shows the reply the extension saved instead of an interrupted turn', async () => {
    document.getElementById('sp-new-chat-btn')!.click();
    await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('send'));
    await saveActiveConversation(OWNER, [
      { role: 'user', content: 'Draft the email', timestamp: 2_000, runtime: 'managed-cloud' },
      {
        role: 'assistant',
        content: 'Dear',
        timestamp: 2_001,
        runtime: 'managed-cloud',
        streaming: true,
      },
    ]);
    chromeMock.runtime.sendMessage.mockClear();
    chromeMock.adoptReply = async (message) => {
      await settleDetachedAssistantTurn(
        message['owner'] as typeof OWNER,
        message['historyConversationId'] as string,
        {
          content: 'Dear team, the launch moved to Friday.',
        },
      );
      return { success: true };
    };

    account.owner = { ...OWNER, authIncarnation: 'session-reopened' };
    account.onChange!();
    await vi.waitFor(() => expect(adoptRequests()).toHaveLength(1));

    await vi.waitFor(() =>
      expect(transcriptText()).toContain('Dear team, the launch moved to Friday.'),
    );
    expect(sendButton().getAttribute('data-mode')).toBe('send');
  });
});
