import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ArchivedChatsSection } from './ArchivedChatsSection';
import { PrivacySection } from './PrivacySection';
import { SharedLinksSection } from './SharedLinksSection';

const mocks = vi.hoisted(() => ({
  listArchived: vi.fn(),
  restoreArchived: vi.fn(),
  deleteConversation: vi.fn(),
  bulkAction: vi.fn(),
  listShares: vi.fn(),
  revokeShare: vi.fn(),
  listPublished: vi.fn(),
  unpublish: vi.fn(),
  routerReplace: vi.fn(),
  historyStats: vi.fn(),
}));

const confirmStub = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: { title: string; description: string }) => true),
  dialog: null as React.ReactNode,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));

vi.mock('../services/conversation-data-service', () => ({
  listArchivedConversations: (...args: unknown[]) => mocks.listArchived(...args),
  restoreArchivedConversation: (...args: unknown[]) => mocks.restoreArchived(...args),
  deleteManagedConversation: (...args: unknown[]) => mocks.deleteConversation(...args),
  applyBulkConversationAction: (...args: unknown[]) => mocks.bulkAction(...args),
  fetchConversationHistoryStats: (...args: unknown[]) => mocks.historyStats(...args),
  listSharedLinks: (...args: unknown[]) => mocks.listShares(...args),
  revokeSharedLink: (...args: unknown[]) => mocks.revokeShare(...args),
  listPublishedArtifacts: (...args: unknown[]) => mocks.listPublished(...args),
  unpublishArtifact: (...args: unknown[]) => mocks.unpublish(...args),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (state: { subscription: { status: string; tier: string } }) => unknown,
  ) => selector({ subscription: { status: 'active', tier: 'pro' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async () => ({ shareTelemetry: false })),
  savePreferenceNamespace: vi.fn(async () => undefined),
}));

vi.mock('@/lib/sentry-shared', () => ({
  setTelemetryConsentCache: vi.fn(),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  Switch: ({ checked }: { checked: boolean }) => <span role="switch" aria-checked={checked} />,
  useConfirm: () => confirmStub,
}));

const archivedConversation = {
  id: 'conversation-1',
  title: 'Archived planning',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const storeConversation = {
  id: 'conversation-1',
  title: 'Archived planning',
  model: 'auto',
  projectId: null,
  isPinned: false,
  isStarred: false,
  isArchived: true,
  isTemporary: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

describe('Web conversation data settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listArchived.mockResolvedValue({
      conversations: [archivedConversation],
      hasMore: false,
      nextOffset: 1,
    });
    mocks.restoreArchived.mockResolvedValue(undefined);
    mocks.deleteConversation.mockResolvedValue(undefined);
    mocks.bulkAction.mockResolvedValue(1);
    mocks.listShares.mockResolvedValue([]);
    mocks.revokeShare.mockResolvedValue(undefined);
    mocks.listPublished.mockResolvedValue([]);
    mocks.unpublish.mockResolvedValue(undefined);
    mocks.historyStats.mockResolvedValue({ conversationCount: 1, messageCount: 1 });
    useChatStore.setState({
      conversations: [storeConversation],
      activeConversationId: null,
      streamingConversationIds: [],
      loadingConversationIds: [],
    });
  });

  it('lists archived chats and restores them through the real manager contract', async () => {
    render(<ArchivedChatsSection />);

    expect(await screen.findByText('Archived planning')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mocks.restoreArchived).toHaveBeenCalledWith('conversation-1'));
    expect(screen.getByText('Restored “Archived planning”.')).toBeInTheDocument();
    expect(useChatStore.getState().conversations[0]?.isArchived).toBe(false);
  });

  it('permanently deletes every archived chat only after confirmation', async () => {
    render(<ArchivedChatsSection />);

    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Delete all archived' }));

    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('delete_archived'));
    expect(confirmStub.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete all archived chats?',
        variant: 'destructive',
      }),
    );
    expect(screen.getByText('No archived chats')).toBeInTheDocument();
  });

  it('lists and revokes account-owned shared links', async () => {
    mocks.listShares.mockResolvedValue([
      {
        token: 'share-token',
        title: 'Shared planning',
        shareUrl: 'https://agiworkforce.com/share/share-token',
        modelId: null,
        provider: null,
        messageCount: 3,
        createdAt: '2026-07-01T00:00:00.000Z',
        expiresAt: '2026-08-01T00:00:00.000Z',
        expired: false,
      },
    ]);

    render(<SharedLinksSection />);

    expect(await screen.findByText('Shared planning')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://agiworkforce.com/share/share-token',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(mocks.revokeShare).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));

    await waitFor(() => expect(mocks.revokeShare).toHaveBeenCalledWith('share-token'));
    expect(screen.getByText('No shared links')).toBeInTheDocument();
  });

  it('exposes archive-all, delete-all, archived, and shared-link controls in Privacy', async () => {
    render(<PrivacySection />);

    const manageLinks = screen.getAllByRole('link', { name: 'Manage' });
    expect(manageLinks.some((link) => link.getAttribute('href') === '/settings/shared-links')).toBe(
      true,
    );
    expect(manageLinks.some((link) => link.getAttribute('href') === '/settings/archived')).toBe(
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive all' }));
    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('archive_all'));
    expect(useChatStore.getState().conversations[0]?.isArchived).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('delete_all'));
    expect(mocks.routerReplace).toHaveBeenCalledWith('/chat');
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it('scopes delete-all by the account total, not the pages the sidebar happens to hold', async () => {
    mocks.historyStats.mockResolvedValue({ conversationCount: 812, messageCount: 9001 });

    render(<PrivacySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));

    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('delete_all'));
    const description = confirmStub.confirm.mock.lastCall?.[0].description ?? '';
    expect(description).toContain('812');
    expect(description).not.toContain(`${useChatStore.getState().conversations.length} chat`);
  });

  it('does not claim a soft delete is irreversible', async () => {
    mocks.historyStats.mockResolvedValue({ conversationCount: 3, messageCount: 9 });

    render(<PrivacySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('delete_all'));

    const description = confirmStub.confirm.mock.lastCall?.[0].description ?? '';
    expect(description).not.toMatch(/cannot be undone/i);
    expect(description).toMatch(/restore/i);
  });

  it('falls back to an unnumbered scope when the account total cannot be read', async () => {
    mocks.historyStats.mockRejectedValue(new Error('offline'));

    render(<PrivacySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(mocks.bulkAction).toHaveBeenCalledWith('delete_all'));

    const description = confirmStub.confirm.mock.lastCall?.[0].description ?? '';
    expect(description).toContain('Every chat in your account');
    expect(description).not.toMatch(/\ball \d+ chat/i);
  });
});
