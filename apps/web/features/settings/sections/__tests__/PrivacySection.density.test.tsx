import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_ANALYTICS_CONSENT_PATH } from '@agiworkforce/types';
import React from 'react';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
type ScanModule0 = typeof import('@agiworkforce/ui');
type ScanModule1 = typeof import('@/lib/sentry-shared');

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  stored: { shareTelemetry: false, keepOutOfProviderTraining: false },
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('../../services/privacy-preferences-client', async (original) => ({
  ...(await original<ImportedModule0>()),
  readPrivacyPreferences: vi.fn(async () => ({ stored: { ...fixture.stored }, version: 'v1' })),
  savePrivacyPreference: vi.fn(
    async (_authority: unknown, key: keyof typeof fixture.stored, value: boolean) => {
      fixture.stored[key] = value;
      return { stored: { ...fixture.stored }, version: 'v2' };
    },
  ),
}));

vi.mock('../../components/BulkConversationControls', () => ({
  BulkConversationControls: () => null,
}));

vi.mock('../../components/UsOnlyRoutingPanel', () => ({
  UsOnlyRoutingPanel: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
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
  }) =>
    React.createElement('button', {
      type: 'button',
      disabled,
      role: 'switch',
      'aria-checked': Boolean(checked),
      'aria-label': ariaLabel,
      onClick: () => onCheckedChange?.(!checked),
    }),
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

vi.mock('@/lib/sentry-shared', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  setTelemetryConsentCache: vi.fn(),
  hasPendingTelemetryOptOut: vi.fn(() => false),
  confirmTelemetryConsent: vi.fn(),
  requestTelemetryOptOut: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', async (original) => ({
  ...(await original<ImportedModule1>()),
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => ({})),
}));

vi.mock('../../services/conversation-data-service', () => ({
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';
import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';
import { savePrivacyPreference } from '../../services/privacy-preferences-client';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  observePreferenceOwner(null);
  fixture.stored = { shareTelemetry: false, keepOutOfProviderTraining: false };
  fetchMock.mockResolvedValue(Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function waitForLoadedPrivacy() {
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(PRODUCT_ANALYTICS_CONSENT_PATH, {
      credentials: 'same-origin',
    });
    expect(screen.getByRole('switch', { name: /Share crash and error reports/i })).toBeEnabled();
    expect(screen.queryByText(/updating account settings/i)).toBeNull();
    expect(screen.queryByText(/loading your product analytics choice/i)).toBeNull();
    expect(screen.queryByText(/loading your marketing email choice/i)).toBeNull();
  });
}

describe('PrivacySection row density', () => {
  it('renders no prose card and no lingering loading or saved text when nothing changed', async () => {
    render(<PrivacySection />);

    await waitForLoadedPrivacy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText(/local-first/i)).toBeNull();
    expect(screen.queryByText('Synced to your account')).toBeNull();
    expect(document.querySelector('[class*="rounded-lg border"]')).toBeNull();
  });

  it('puts the marketing email choice beside the product analytics choice', async () => {
    render(<PrivacySection />);
    await waitForLoadedPrivacy();

    const analytics = screen.getByRole('switch', { name: 'Product analytics' });
    const updates = screen.getByRole('switch', { name: MARKETING_EMAIL_CONSENT_PURPOSE.label });
    const switches = screen.getAllByRole('switch');

    expect(switches.indexOf(updates)).toBe(switches.indexOf(analytics) + 1);
    expect(updates).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(MARKETING_EMAIL_CONSENT_PURPOSE.description)).toBeVisible();
  });

  it('shows a saved state only after an actual change', async () => {
    render(<PrivacySection />);
    await waitForLoadedPrivacy();
    expect(screen.queryByRole('status')).toBeNull();

    await userEvent.click(screen.getByRole('switch', { name: /Share crash and error reports/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Your privacy setting was saved.'),
    );
    expect(savePrivacyPreference).toHaveBeenCalledWith(expect.anything(), 'shareTelemetry', true);
  });

  it('says that chats started inside a project are saved even when new chats start temporary', () => {
    render(<PrivacySection />);

    expect(screen.getByRole('switch', { name: 'Start new chats as temporary' })).toBeVisible();
    expect(screen.getByText(/Project chats are saved/i)).toBeVisible();
  });

  it('never names the telemetry vendor or implementation detail in the toggle copy', () => {
    render(<PrivacySection />);
    expect(screen.queryByText(/sentry/i)).toBeNull();
    expect(screen.queryByText(/beforeSend/i)).toBeNull();
    expect(screen.getByText(/sensitive fields removed/i)).toBeInTheDocument();
    expect(screen.queryByText(/message content is never included/i)).toBeNull();
  });
});

type ImportedModule0 = typeof import('../../services/privacy-preferences-client');
type ImportedModule1 = typeof import('@/app/settings/_lib/preferences-client');
