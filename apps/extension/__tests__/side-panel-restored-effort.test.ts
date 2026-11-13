// @vitest-environment jsdom

/**
 * A chat that carries no effort of its own, such as one brought in from the
 * account, opens at the effort the person chose, as it does on the web,
 * instead of silently switching to the model's default.
 */

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
import {
  EFFORT_LABEL,
  getPickerModels,
  parseManagedUsageSummaryResponse,
  resolveModelEffort,
  type Effort,
} from '@agiworkforce/types';

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

import { SELECTED_EFFORT_STORAGE_KEY, SELECTED_MODEL_STORAGE_KEY } from '../src/background/policy';
import { getManagedEffortControlState } from '../src/features/cloud-bridge/managedModelPicker';
import { saveActiveConversation } from '../src/features/background/conversation-history';

const OWNER = { accountId: 'account-fixture', authIncarnation: 'session-fixture' };

function storedSelection(): { model: string; effort: Effort } {
  for (const model of getPickerModels()) {
    const state = getManagedEffortControlState(model.id, undefined, undefined, 'pro');
    const fallback = resolveModelEffort(model.id, undefined);
    const effort = state.options.find((option) => option !== fallback);
    if (state.status === 'ready' && effort) return { model: model.id, effort };
  }
  throw new Error('The catalog has no picker model with a non-default effort.');
}

describe('resuming a chat that has no effort of its own', () => {
  it('uses the reasoning effort the person chose', async () => {
    const { model, effort } = storedSelection();
    account.modelIds = getPickerModels().map((entry) => entry.id);
    await chromeMock.storage.local.set({
      [SELECTED_MODEL_STORAGE_KEY]: model,
      [SELECTED_EFFORT_STORAGE_KEY]: effort,
    });
    await saveActiveConversation(
      OWNER,
      [
        {
          role: 'user',
          content: 'Summarize the report',
          timestamp: 1_000,
          runtime: 'managed-cloud',
        },
        { role: 'assistant', content: 'It grew.', timestamp: 1_001, runtime: 'managed-cloud' },
      ],
      { selectedModel: model },
    );

    await import('../src/side_panel');

    const badge = (): HTMLElement | null => document.getElementById('sp-model-effort-badge');
    await vi.waitFor(() =>
      expect(document.getElementById('sp-messages')?.textContent).toContain('It grew.'),
    );
    await vi.waitFor(() => expect(badge()?.hidden).toBe(false));
    await vi.waitFor(() => expect(badge()?.textContent).toBe(EFFORT_LABEL[effort]));
  });

  it('keeps the effort choices in view beside the model list in a short panel', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });
    document.getElementById('sp-model-selector-btn')!.click();
    const dropdown = document.getElementById('sp-model-dropdown')!;
    const list = dropdown.querySelector<HTMLElement>('.sp-model-menu-list')!;
    const settings = dropdown.querySelector<HTMLElement>('.sp-model-menu-settings')!;
    expect(dropdown.classList.contains('open')).toBe(true);
    expect(list.querySelector('.sp-model-option')).not.toBeNull();
    expect(list.querySelector('.sp-effort-option')).toBeNull();
    expect(settings.querySelectorAll('.sp-effort-option').length).toBeGreaterThan(0);
    expect(list.contains(settings)).toBe(false);
    const menuHeight = Number.parseInt(dropdown.style.maxHeight, 10);
    const settingsHeight = Number.parseInt(settings.style.maxHeight, 10);
    expect(menuHeight).toBeLessThanOrEqual(320);
    expect(settingsHeight).toBeGreaterThan(0);
    expect(settingsHeight).toBeLessThan(menuHeight);
  });
});
