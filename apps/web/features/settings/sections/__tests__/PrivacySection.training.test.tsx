vi.mock('@/features/settings/hooks/use-preference-owner', async (original) => ({
  ...(await original<ImportedModule0>()),
  usePreferenceOwner: () => null,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
type ScanModule0 = typeof import('@agiworkforce/ui');
type ScanModule1 = typeof import('@/lib/sentry-shared');

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
  Switch: ({ checked, 'aria-label': label }: { checked?: boolean; 'aria-label'?: string }) =>
    React.createElement('button', {
      role: 'switch',
      'aria-checked': Boolean(checked),
      'aria-label': label,
    }),
  useConfirm: () => ({ confirm: vi.fn(async () => true), dialog: null }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  getCsrfToken: async () => 'test-token',
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

  it('states that customer content is not used to improve AGI-owned models', () => {
    openProtectionCopy();

    expect(
      screen.getByText(
        /we do not use your prompts, responses, files or voice recordings to train or improve AGI-owned models\./i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/There is no training opt-in/i)).toBeNull();
  });

  it('never promises a training opt-in the product does not implement', () => {
    openProtectionCopy();

    expect(screen.queryByText(/without your explicit opt-in/i)).toBeNull();
  });

  it('offers the chat and voice choices apart from the provider switch, both off', () => {
    render(<PrivacySection />);

    const heading = screen.getByRole('heading', { name: 'Help improve AGI models' });
    const section = within(heading.closest('section')!);
    expect(
      section.getByRole('switch', { name: 'Use my chats to improve AGI models' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      section.getByRole('switch', { name: 'Use my voice recordings to improve AGI models' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(section.queryByRole('switch', { name: /Only use models/i })).toBeNull();
    expect(section.getByText(/Nothing is used for this today\./)).toBeTruthy();
  });
});

type ImportedModule0 = typeof import('@/features/settings/hooks/use-preference-owner');
type ImportedModule1 = typeof import('@/app/settings/_lib/preferences-client');
