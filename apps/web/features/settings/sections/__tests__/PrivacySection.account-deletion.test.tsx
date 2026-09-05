/**
 * Account deletion used to exist twice: AccountSection's dialog-based flow
 * (the canonical one, which signs the user out after a successful deletion)
 * and a second, independent implementation inline in PrivacySection's Danger
 * zone. The Privacy copy had its own fetch to DELETE /api/user/delete-account,
 * its own hardcoded "within 24 hours" string that could drift from the real
 * server-reported `scheduledFor`, and, critically, no `logout`/
 * `clerkSignOut`/`useClerk` anywhere in the file, so a user who deleted their
 * account from Privacy kept a fully authenticated client session against an
 * account scheduled for erasure.
 *
 * That implementation has been removed entirely. This suite pins the
 * invariant that PrivacySection can never again offer a delete path that
 * ends with a live session, either by re-implementing deletion locally, or
 * by silently regressing to a state where deletion is unreachable. It must
 * point at Account settings (the single remaining implementation) instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', () => ({
  Switch: ({ checked }: { checked?: boolean }) =>
    React.createElement('button', { role: 'switch', 'aria-checked': Boolean(checked) }),
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

describe('PrivacySection · account deletion is a cross-link, not a second implementation', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders no delete-confirmation UI of its own', () => {
    render(<PrivacySection />);

    expect(screen.queryByRole('button', { name: /^delete account$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/type delete to confirm/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm deletion/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/type delete to confirm/i)).not.toBeInTheDocument();
  });

  it('never calls DELETE /api/user/delete-account itself', () => {
    render(<PrivacySection />);

    const deleteAccountCalls = fetchSpy.mock.calls.filter(
      ([input]) => String(input) === '/api/user/delete-account',
    );
    expect(deleteAccountCalls).toHaveLength(0);
  });

  it('points users at Account settings, the single remaining implementation', () => {
    render(<PrivacySection />);

    const link = screen.getByRole('link', { name: /account settings/i });
    expect(link).toHaveAttribute('href', '/settings/account');
  });

  it('still shows the danger zone heading, so the cross-link is discoverable', () => {
    render(<PrivacySection />);

    expect(screen.getByText('Danger zone')).toBeInTheDocument();
  });
});
