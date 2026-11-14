import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  callbacks: [] as Array<{ label: string; change: (value: boolean) => void }>,
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => identity.auth, useClerk: () => identity.sdk }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => new Headers(headers)),
}));

vi.mock('../../components/BulkConversationControls', () => ({
  BulkConversationControls: () => null,
}));

vi.mock('../../components/UsOnlyRoutingPanel', () => ({
  UsOnlyRoutingPanel: () => null,
}));

vi.mock('../../components/ProductAnalyticsConsentRow', () => ({
  ProductAnalyticsConsentRow: () => null,
}));
vi.mock('../../components/MarketingEmailConsentRow', () => ({
  MarketingEmailConsentRow: () => null,
}));
vi.mock('../../components/NamedProviderConsentRows', () => ({
  NamedProviderConsentRows: () => null,
}));
vi.mock('../../components/DataExportRow', () => ({
  DataExportRow: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (original) => ({
  ...(await original<ImportedModule1>()),
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (next: boolean) => void;
    'aria-label'?: string;
  }) => {
    if (onCheckedChange)
      identity.callbacks.push({ label: ariaLabel ?? '', change: onCheckedChange });
    return React.createElement('button', {
      type: 'button',
      disabled,
      role: 'switch',
      'aria-checked': Boolean(checked),
      'aria-label': ariaLabel,
      onClick: () => onCheckedChange?.(!checked),
    });
  },
  useConfirm: () => ({ confirm: vi.fn(async () => true), dialog: null }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) => selector({ subscription: undefined }),
}));

vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (s: unknown) => unknown) =>
    selector({
      conversations: [],
      streamingConversationIds: new Set<string>(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    }),
}));

vi.mock('../../services/conversation-data-service', () => ({
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';

import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  hasPendingTelemetryOptOut,
  hasTelemetryConsent,
  requestTelemetryOptOut,
  setTelemetryConsentCache,
} from '@/lib/sentry-shared';

const fetchMock = vi.fn<typeof fetch>();
const json = (privacy: unknown, version: string | null = 'v1') =>
  Response.json({ settings: { privacy }, version });
const toggle = () => screen.getByRole('switch', { name: /Share crash and error reports/i });
const training = () => screen.getByRole('switch', { name: /Only use models/i });
const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function retained() {
  return identity.callbacks.filter(({ label }) => label === 'Share crash and error reports').at(-1)!
    .change;
}

beforeEach(() => {
  vi.clearAllMocks();
  observePreferenceOwner(null);
  identity.auth = { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' };
  identity.sdk.loaded = true;
  identity.sdk.user = { id: 'a' };
  identity.sdk.session = { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' };
  identity.callbacks = [];
  localStorage.clear();
  setTelemetryConsentCache(false);
  fetchMock.mockReset().mockImplementation(async () => json({ shareTelemetry: false }));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => new Headers(headers));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('owned privacy preference persistence', () => {
  it('blocks changes before a strict account read and supports legitimate first use', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<PrivacySection />);
    expect(toggle()).toBeDisabled();
    await act(async () => pending.resolve(Response.json({ settings: {}, version: null })));
    expect(toggle()).toBeEnabled();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(training()).toHaveAttribute('aria-checked', 'false');
  });

  it('offers load retry with disabled controls over an invalid account response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ settings: { privacy: { shareTelemetry: 'yes' } }, version: 'v1' }),
      )
      .mockResolvedValueOnce(json({ shareTelemetry: false }));
    render(<PrivacySection />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry loading' })).toBeVisible(),
    );
    expect(toggle()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveStyle({ color: 'var(--settings-destructive-text)' });
    expect(screen.getByRole('alert')).not.toHaveTextContent('Saved');
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(puts()).toHaveLength(0);
  });

  it('sends one field once in StrictMode and grants only after a stored receipt', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === 'PUT'
        ? pending.promise
        : json({ shareTelemetry: puts().length > 0, keepOutOfProviderTraining: true }),
    );
    render(
      <React.StrictMode>
        <PrivacySection />
      </React.StrictMode>,
    );
    await waitFor(() => expect(toggle()).toBeEnabled());
    const change = retained();
    act(() => {
      change(true);
      change(true);
    });
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(hasTelemetryConsent()).toBe(false);
    const init = puts()[0]![1]!;
    expect(JSON.parse(String(init.body))).toEqual({
      namespace: 'privacy',
      patch: { shareTelemetry: true },
    });
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    await act(async () =>
      pending.resolve(json({ shareTelemetry: true, keepOutOfProviderTraining: true })),
    );
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(hasTelemetryConsent()).toBe(true);
    expect(training()).toHaveAttribute('aria-checked', 'true');
    act(() => change(false));
    expect(puts()).toHaveLength(1);
  });

  it('reconciles a malformed receipt and retries only a read, never an old payload', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockResolvedValueOnce(new Response('not json', { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ shareTelemetry: false, keepOutOfProviderTraining: true }));
    render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    await userEvent.click(toggle());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry loading' })).toBeVisible(),
    );
    expect(hasTelemetryConsent()).toBe(false);
    expect(toggle()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(puts()).toHaveLength(1);
    expect(training()).toHaveAttribute('aria-checked', 'true');
  });

  it('denies immediately and lets a fresh choice persist denial after reconciliation', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: true }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ shareTelemetry: true, keepOutOfProviderTraining: true }))
      .mockResolvedValueOnce(json({ shareTelemetry: false, keepOutOfProviderTraining: true }))
      .mockResolvedValueOnce(json({ shareTelemetry: false, keepOutOfProviderTraining: true }));
    render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    const csrf = deferred<Headers>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    act(() => retained()(false));
    expect(hasTelemetryConsent()).toBe(false);
    await act(async () => csrf.resolve(new Headers()));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Keep telemetry off for my account' }),
      ).toBeVisible(),
    );
    setTelemetryConsentCache(true);
    expect(hasTelemetryConsent()).toBe(false);
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep telemetry off for my account' }),
    );
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(puts()).toHaveLength(2);
    expect(JSON.parse(String(puts()[1]![1]!.body))).toEqual({
      namespace: 'privacy',
      patch: { shareTelemetry: false },
    });
  });

  it('patches training alone without confirming a pending telemetry grant from its receipt', async () => {
    requestTelemetryOptOut();
    const reconciliation = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: true, keepOutOfProviderTraining: false }))
      .mockResolvedValueOnce(json({ shareTelemetry: true, keepOutOfProviderTraining: true }))
      .mockReturnValueOnce(reconciliation.promise);
    render(<PrivacySection />);
    await waitFor(() => expect(training()).toBeEnabled());
    await userEvent.click(training());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(puts()[0]![1]!.body))).toEqual({
      namespace: 'privacy',
      patch: { keepOutOfProviderTraining: true },
    });
    expect(hasPendingTelemetryOptOut()).toBe(true);
    expect(hasTelemetryConsent()).toBe(false);
    await act(async () =>
      reconciliation.resolve(json({ shareTelemetry: true, keepOutOfProviderTraining: true })),
    );
    await waitFor(() => expect(training()).toBeEnabled());
    expect(training()).toHaveAttribute('aria-checked', 'true');
    expect(hasPendingTelemetryOptOut()).toBe(true);
    expect(hasTelemetryConsent()).toBe(false);
  });

  it.each([
    ['Use my chats to improve AGI models', 'allowChatsForModelImprovement'],
    ['Use my voice recordings to improve AGI models', 'allowVoiceForModelImprovement'],
  ])('saves "%s" as its own privacy choice, apart from provider training', async (name, key) => {
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockResolvedValueOnce(json({ shareTelemetry: false, [key]: true }))
      .mockResolvedValueOnce(json({ shareTelemetry: false, [key]: true }));
    render(<PrivacySection />);
    const control = () => screen.getByRole('switch', { name });
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(puts()[0]![1]!.body))).toEqual({
      namespace: 'privacy',
      patch: { [key]: true },
    });
    await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'true'));
    expect(training()).toHaveAttribute('aria-checked', 'false');
  });

  it('reports an unconfirmed model improvement save and keeps the stored choice', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(json({ shareTelemetry: false }));
    render(<PrivacySection />);
    const control = () =>
      screen.getByRole('switch', { name: 'Use my chats to improve AGI models' });
    await waitFor(() => expect(control()).toBeEnabled());
    await userEvent.click(control());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm whether your change/),
    );
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(control()).toBeEnabled();
    expect(puts()).toHaveLength(1);
  });

  it('settles pending denial on authoritative false reconciliation and permits later passive true recovery', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: true }))
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockResolvedValueOnce(json({ shareTelemetry: true }));
    const mounted = render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(toggle());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(hasTelemetryConsent()).toBe(false);
    expect(hasPendingTelemetryOptOut()).toBe(false);
    mounted.unmount();
    render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    expect(hasTelemetryConsent()).toBe(true);
    expect(hasPendingTelemetryOptOut()).toBe(false);
    expect(puts()).toHaveLength(1);
  });

  it('rejects callbacks retained after unmount and before a changed session rerenders', async () => {
    const mounted = render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    const change = retained();
    identity.sdk.session = { ...identity.sdk.session };
    act(() => change(true));
    expect(puts()).toHaveLength(0);
    mounted.unmount();
    act(() => change(true));
    expect(puts()).toHaveLength(0);
  });

  it('does not dispatch after retirement during CSRF acquisition', async () => {
    const csrf = deferred<Headers>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const mounted = render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    act(() => retained()(true));
    mounted.unmount();
    await act(async () => csrf.resolve(new Headers()));
    expect(puts()).toHaveLength(0);
    expect(hasTelemetryConsent()).toBe(false);
  });

  it('does not grant, publish or reconcile a late receipt after unmount', async () => {
    const pending = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json({ shareTelemetry: false }))
      .mockReturnValueOnce(pending.promise);
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    const mounted = render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    await userEvent.click(toggle());
    await waitFor(() => expect(puts()).toHaveLength(1));
    mounted.unmount();
    await act(async () => pending.resolve(json({ shareTelemetry: true })));
    expect(hasTelemetryConsent()).toBe(false);
    expect(event).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    window.removeEventListener('agi:preference-namespace-saved', event);
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
type ImportedModule1 = typeof import('@agiworkforce/ui');
