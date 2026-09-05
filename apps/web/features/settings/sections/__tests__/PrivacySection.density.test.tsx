import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', () => ({
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

vi.mock('@/lib/sentry-shared', () => ({ setTelemetryConsentCache: vi.fn() }));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => ({})),
}));

vi.mock('../../services/conversation-data-service', () => ({
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';

describe('PrivacySection row density', () => {
  it('renders no prose card and no lingering loading or saved text when nothing changed', async () => {
    render(<PrivacySection />);

    await waitFor(() => expect(screen.queryByText(/loading account settings/i)).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText(/local-first/i)).toBeNull();
    expect(screen.queryByText('Synced to your account')).toBeNull();
    expect(document.querySelector('[class*="rounded-lg border"]')).toBeNull();
  });

  it('shows a saved state only after an actual change', async () => {
    render(<PrivacySection />);
    await waitFor(() => expect(screen.queryByText(/loading account settings/i)).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();

    await userEvent.click(screen.getByRole('switch', { name: /Share crash and usage telemetry/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('never names the telemetry vendor or implementation detail in the toggle copy', () => {
    render(<PrivacySection />);
    expect(screen.queryByText(/sentry/i)).toBeNull();
    expect(screen.queryByText(/beforeSend/i)).toBeNull();
    expect(screen.getByText(/message content is never included/i)).toBeInTheDocument();
  });
});
