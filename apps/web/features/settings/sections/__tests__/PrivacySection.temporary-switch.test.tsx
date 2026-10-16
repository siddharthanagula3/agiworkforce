import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '@shared/stores/web-settings-store';

type ScanModule0 = typeof import('@agiworkforce/ui');
type ScanModule1 = typeof import('@/lib/sentry-shared');

vi.mock('../../components/UsOnlyRoutingPanel', async (importOriginal) => ({
  ...(await importOriginal<UsOnlyRoutingPanelModule>()),
  UsOnlyRoutingPanel: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  useConfirm: () => ({ confirm: vi.fn(async () => true), dialog: null }),
}));

vi.mock('@shared/stores/web-auth-store', async (importOriginal) => ({
  ...(await importOriginal<WebAuthStoreModule>()),
  useBillingStore: (selector: (s: unknown) => unknown) => selector({ subscription: undefined }),
}));

vi.mock('@shared/stores/web-chat-store', async (importOriginal) => ({
  ...(await importOriginal<WebChatStoreModule>()),
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

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<PreferencesClientModule>()),
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => ({})),
}));

vi.mock('../../services/conversation-data-service', async (importOriginal) => ({
  ...(await importOriginal<ConversationDataServiceModule>()),
  applyBulkConversationAction: vi.fn(async () => ({ ok: true })),
  fetchConversationHistoryStats: vi.fn(async () => ({ conversationCount: 0, messageCount: 0 })),
}));

import { PrivacySection } from '../PrivacySection';

type WebAuthStoreModule = typeof import('@shared/stores/web-auth-store');
type WebChatStoreModule = typeof import('@shared/stores/web-chat-store');
type PreferencesClientModule = typeof import('@/app/settings/_lib/preferences-client');
type ConversationDataServiceModule = typeof import('../../services/conversation-data-service');
type UsOnlyRoutingPanelModule = typeof import('../../components/UsOnlyRoutingPanel');

beforeEach(() => {
  useSettingsStore.setState({ newChatsTemporary: false });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Against the hand-rolled button this row drew before 951653d97d, which had
// neither data-state nor the shared unchecked edge, both render checks fail.
describe('the start-as-temporary switch', () => {
  it('is the shared switch, whose off state keeps a visible edge', () => {
    render(<PrivacySection />);

    const toggle = screen.getByRole('switch', { name: 'Start new chats as temporary' });
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    expect(toggle.className).toContain('data-[state=unchecked]:border-muted-foreground');
  });

  it('turns temporary-by-default on from the shared switch', async () => {
    render(<PrivacySection />);

    const toggle = screen.getByRole('switch', { name: 'Start new chats as temporary' });
    await userEvent.click(toggle);

    expect(useSettingsStore.getState().newChatsTemporary).toBe(true);
    expect(toggle).toHaveAttribute('data-state', 'checked');
  });
});
