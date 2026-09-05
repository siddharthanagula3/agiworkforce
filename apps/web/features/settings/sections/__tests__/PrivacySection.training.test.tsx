/**
 * Web privacy settings must not advertise a model-training opt-in.
 *
 * `improveModelTraining` was removed from TOGGLES because nothing consumed it,
 * and no training-data pipeline exists to gate. The explanatory copy in "How we
 * protect your data" still said data would not be used for training "without
 * your explicit opt-in", which points users at a control they cannot find and
 * contradicts the mobile Cloud Privacy screen. This test pins the honest
 * statement and fails if the opt-in promise comes back without the pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', () => ({
  Switch: ({ checked }: { checked?: boolean }) =>
    React.createElement('button', { role: 'switch', 'aria-checked': Boolean(checked) }),
  // shell-nav-ia-gap-01 remainder: PrivacySection's bulk-delete/archive
  // actions now confirm through the shared AlertDialog wrapper instead of
  // window.confirm, stub it the same way as ConversationDataSections.test.tsx
  // and WebAppShell.test.tsx so this fully-replaced module mock still renders.
  useConfirm: () => ({ confirm: vi.fn(async () => true), dialog: null }),
}));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: async () => 'test-token' }));

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

function openProtectionCopy() {
  render(<PrivacySection />);
  fireEvent.click(screen.getByRole('button', { name: /how we protect your data/i }));
}

describe('PrivacySection model-training copy', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('states that no training opt-in exists', () => {
    openProtectionCopy();

    expect(
      screen.getByText(/There is no training opt-in, because that data path does not exist\./i),
    ).toBeTruthy();
  });

  it('never promises a training opt-in the product does not implement', () => {
    openProtectionCopy();

    expect(screen.queryByText(/without your explicit opt-in/i)).toBeNull();
    expect(screen.queryByRole('switch', { name: /training/i })).toBeNull();
  });
});
