import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_ANALYTICS_CONSENT_PATH } from '@agiworkforce/types';
import React from 'react';
type ScanModule0 = typeof import('@agiworkforce/ui');
type ScanModule1 = typeof import('@/lib/sentry-shared');

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
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean;
    onCheckedChange?: (next: boolean) => void;
    'aria-label'?: string;
  }) =>
    React.createElement('button', {
      type: 'button',
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
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => ({})),
}));

vi.mock('../../services/conversation-data-service', () => ({
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';

const fetchMock = vi.fn();

beforeEach(() => {
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
    expect(screen.queryByText(/loading account settings/i)).toBeNull();
    expect(screen.queryByText(/loading your product analytics choice/i)).toBeNull();
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

  it('shows a saved state only after an actual change', async () => {
    render(<PrivacySection />);
    await waitForLoadedPrivacy();
    expect(screen.queryByRole('status')).toBeNull();

    await userEvent.click(screen.getByRole('switch', { name: /Share crash and error reports/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('says that chats started inside a project are saved even when new chats start temporary', () => {
    render(<PrivacySection />);

    expect(screen.getByRole('switch', { name: 'Start new chats as temporary' })).toBeVisible();
    expect(screen.getByText(/chats you start inside a project are always saved/i)).toBeVisible();
  });

  it('never names the telemetry vendor or implementation detail in the toggle copy', () => {
    render(<PrivacySection />);
    expect(screen.queryByText(/sentry/i)).toBeNull();
    expect(screen.queryByText(/beforeSend/i)).toBeNull();
    expect(screen.getByText(/sensitive request fields are removed/i)).toBeInTheDocument();
    expect(screen.queryByText(/message content is never included/i)).toBeNull();
  });
});
