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

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const chip = (): HTMLButtonElement => byId('sp-autonomy-chip') as HTMLButtonElement;
const popover = (): HTMLElement => byId('sp-autonomy-popover');
const option = (name: string): HTMLElement =>
  [...popover().querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((item) =>
    item.textContent?.startsWith(name),
  )!;
const fullAccessNotice = (): HTMLElement => byId('sp-full-access-notice');

describe('the approval-mode menu beside +', () => {
  it('names its question and keeps the menu keyboard contract', async () => {
    await import('../src/side_panel');
    await vi.waitFor(() => expect(chip().getAttribute('data-mode')).toBe('ask'));

    chip().click();
    expect(popover().classList.contains('open')).toBe(true);
    const labelledBy = popover().getAttribute('aria-labelledby');
    expect(labelledBy && byId(labelledBy).textContent).toBe('How should AGI act in your browser?');
    expect(document.activeElement).toBe(option('Ask first'));

    press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(option('Full access'));
    press(document.activeElement!, 'ArrowDown');
    const learnMore = document.activeElement as HTMLAnchorElement;
    expect(learnMore.textContent).toContain('Learn more');
    expect(learnMore.getAttribute('role')).toBe('menuitem');
    expect(learnMore.href).toContain('/help/tool-approvals');
    press(learnMore, 'ArrowDown');
    expect(document.activeElement).toBe(option('Ask first'));
    press(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(learnMore);

    press(document.activeElement!, 'Escape');
    expect(popover().classList.contains('open')).toBe(false);
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(chip());
  });

  it('closes when focus leaves it with Tab', () => {
    chip().click();
    expect(popover().classList.contains('open')).toBe(true);
    press(document.activeElement!, 'Tab');
    expect(popover().classList.contains('open')).toBe(false);
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it('discloses what Full access still asks about, once', async () => {
    expect(fullAccessNotice().classList.contains('visible')).toBe(false);

    chip().click();
    option('Full access').click();
    await vi.waitFor(() => expect(fullAccessNotice().classList.contains('visible')).toBe(true));
    expect(fullAccessNotice().textContent).toContain(
      'Full access is on. AGI acts on your approved sites without asking. It still asks before uploads, downloads, sign-ins, purchases and sensitive input.',
    );
    expect(chip().getAttribute('data-mode')).toBe('full');

    chip().click();
    option('Ask first').click();
    expect(fullAccessNotice().classList.contains('visible')).toBe(false);

    chip().click();
    option('Full access').click();
    await vi.waitFor(() => expect(fullAccessNotice().classList.contains('visible')).toBe(true));
    const dismiss = fullAccessNotice().querySelector<HTMLButtonElement>(
      '.sp-composer-notice-dismiss',
    )!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss the full access notice');
    dismiss.click();
    expect(fullAccessNotice().classList.contains('visible')).toBe(false);

    chip().click();
    option('Ask first').click();
    chip().click();
    option('Full access').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fullAccessNotice().classList.contains('visible')).toBe(false);
  });
});
