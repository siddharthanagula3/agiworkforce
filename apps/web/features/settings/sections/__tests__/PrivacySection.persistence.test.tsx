import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', () => ({
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

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => ({})),
}));

vi.mock('../../services/conversation-data-service', () => ({
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';

import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(fetchPreferenceNamespace).mockResolvedValue({ shareTelemetry: false });
  vi.mocked(savePreferenceNamespace).mockResolvedValue({ version: null });
});

const toggle = () => screen.getByRole('switch', { name: /Share crash and usage telemetry/i });

describe('privacy preference persistence', () => {
  it('prevents changes before account preferences finish loading', async () => {
    let resolve!: (value: { shareTelemetry: boolean }) => void;
    vi.mocked(fetchPreferenceNamespace).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<PrivacySection />);
    expect(toggle()).toBeDisabled();
    await act(async () => resolve({ shareTelemetry: false }));
    expect(toggle()).toBeEnabled();
  });

  it('does not enable telemetry until opt-in is saved and sends only one write in StrictMode', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof savePreferenceNamespace>>) => void;
    vi.mocked(savePreferenceNamespace).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(
      <React.StrictMode>
        <PrivacySection />
      </React.StrictMode>,
    );
    await waitFor(() => expect(screen.queryByText(/loading account settings/i)).toBeNull());
    await userEvent.click(toggle());
    expect(hasTelemetryConsent()).toBe(false);
    expect(toggle()).toBeDisabled();
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ version: null }));
    await waitFor(() => expect(hasTelemetryConsent()).toBe(true));
  });

  it('offers a load retry without enabling controls over unknown account consent', async () => {
    vi.mocked(fetchPreferenceNamespace).mockRejectedValueOnce(new Error('Unavailable'));
    render(<PrivacySection />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry loading' })).toBeVisible(),
    );
    expect(toggle()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('keeps a failed opt-out off locally and retries the intended choice', async () => {
    vi.mocked(fetchPreferenceNamespace).mockResolvedValue({ shareTelemetry: true });
    vi.mocked(savePreferenceNamespace).mockRejectedValueOnce(new Error('Unavailable'));
    render(<PrivacySection />);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(toggle());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry saving/i })).toBeVisible(),
    );
    const failure = screen.getByRole('alert');
    expect(failure).toHaveStyle({ color: 'var(--settings-destructive-text)' });
    expect(failure).not.toHaveTextContent('Saved');
    setTelemetryConsentCache(true);
    expect(hasTelemetryConsent()).toBe(false);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(screen.getByRole('button', { name: /retry saving/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(savePreferenceNamespace).toHaveBeenLastCalledWith('privacy', { shareTelemetry: false });
  });
});
