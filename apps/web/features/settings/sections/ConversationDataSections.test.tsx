vi.mock('@/features/settings/hooks/use-preference-owner', async (original) => ({
  ...(await original<MockedModule0>()),
  usePreferenceOwner: vi.fn<MockedModule0['usePreferenceOwner']>(() => null),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ArchivedChatsSection } from './ArchivedChatsSection';
import { DeletedChatsSection } from './DeletedChatsSection';
import { PrivacySection } from './PrivacySection';
import { usePreferenceOwner } from '@/features/settings/hooks/use-preference-owner';
import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';
import {
  MANAGED_CLOUD_DATA_EXPORT_PATH,
  MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH,
} from '@agiworkforce/cloud-contracts';
import { SharedLinksSection } from './SharedLinksSection';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  admitWorkspace,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
type Original0 = typeof import('@features/sites/services/sites-service');
type ScanModule0 = typeof import('@/lib/sentry-shared');
type ScanModule1 = typeof import('@agiworkforce/ui');

const mocks = vi.hoisted(() => ({
  listArchived: vi.fn(),
  restoreArchived: vi.fn(),
  listDeleted: vi.fn(),
  restoreDeleted: vi.fn(),
  deleteConversation: vi.fn(),
  bulkAction: vi.fn(),
  listShares: vi.fn(),
  revokeShare: vi.fn(),
  listPublished: vi.fn(),
  unpublish: vi.fn(),
  routerReplace: vi.fn(),
  historyStats: vi.fn(),
}));

const session = {
  userId: 'manager-a',
  sessionId: 'manager-session',
  isCurrent: () => true,
  getToken: async () => 'manager-token',
};
vi.mock('@/lib/identity/useSessionSnapshot', () => ({ useSessionSnapshot: () => () => session }));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (original) => ({
  ...(await original<MockedModule1>()),
  useAccountWorkspaces: () => {
    const owner = observeWorkspaceOwner(session)!;
    admitWorkspace(owner, owner.epoch, JSON.stringify(['personal', 'personal', null]));
    return {
      data: { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null },
      refetch: vi.fn(),
      requiresReload: false,
      isSwitching: false,
    };
  },
}));

// Bulk intent behavior lives in BulkConversationControls.test.tsx, using the
// actual owner/admission/transport stack. This suite checks section reachability.
vi.mock('../components/BulkConversationControls', () => ({
  BulkConversationControls: () => (
    <>
      <button>Archive all</button>
      <button>Delete all</button>
    </>
  ),
}));
vi.mock('../components/UsOnlyRoutingPanel', () => ({ UsOnlyRoutingPanel: () => null }));
vi.mock('../components/ProductAnalyticsConsentRow', () => ({
  ProductAnalyticsConsentRow: () => null,
}));
vi.mock('../components/MarketingEmailConsentRow', () => ({ MarketingEmailConsentRow: () => null }));
vi.mock('../components/NamedProviderConsentRows', () => ({ NamedProviderConsentRows: () => null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));

vi.mock('@features/sites/services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<Original0>()),
  listPublishedArtifactVersions: vi.fn(async () => []),
  republishArtifactVersion: vi.fn(async () => undefined),
  listPublishedSitesPage: async (...args: unknown[]) => ({
    sites: await mocks.listPublished(...args),
    workspace: null,
    nextCursor: null,
  }),
  unpublishArtifact: (...args: unknown[]) => mocks.unpublish(...args),
}));

vi.mock('../services/conversation-data-service', () => ({
  listArchivedConversations: (...args: unknown[]) => mocks.listArchived(...args),
  restoreArchivedConversation: (...args: unknown[]) => mocks.restoreArchived(...args),
  listDeletedConversations: (...args: unknown[]) => mocks.listDeleted(...args),
  restoreDeletedConversation: (...args: unknown[]) => mocks.restoreDeleted(...args),
  deleteManagedConversation: (...args: unknown[]) => mocks.deleteConversation(...args),
  applyBulkConversationAction: (...args: unknown[]) => mocks.bulkAction(...args),
  fetchConversationHistoryStats: (...args: unknown[]) => mocks.historyStats(...args),
  listSharedLinks: (request: RequestAuthority) => mocks.listShares(request),
  revokeSharedLink: (token: string, request: RequestAuthority) => mocks.revokeShare(token, request),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (state: { subscription: { status: string; tier: string } }) => unknown,
  ) => selector({ subscription: { status: 'active', tier: 'pro' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', async (original) => ({
  ...(await original<MockedModule2>()),
  fetchPreferenceNamespace: vi.fn(async () => ({ shareTelemetry: false })),
  savePreferenceNamespace: vi.fn(async () => undefined),
}));

vi.mock('@/lib/sentry-shared', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  setTelemetryConsentCache: vi.fn(),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  Switch: ({ checked }: { checked: boolean }) => <span role="switch" aria-checked={checked} />,
}));

const archivedConversation = {
  id: 'conversation-1',
  title: 'Archived planning',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const restoredWire = {
  id: 'conversation-1',
  title: 'Archived planning',
  model: 'auto',
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
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
    vi.mocked(usePreferenceOwner).mockReturnValue(null);
    observeWorkspaceOwner(null);
    mocks.listArchived.mockResolvedValue({
      conversations: [archivedConversation],
      hasMore: false,
      nextOffset: 1,
    });
    mocks.restoreArchived.mockResolvedValue(restoredWire);
    mocks.listDeleted.mockResolvedValue({
      conversations: [archivedConversation],
      hasMore: false,
      nextOffset: 1,
    });
    mocks.restoreDeleted.mockResolvedValue(restoredWire);
    mocks.deleteConversation.mockResolvedValue(undefined);
    mocks.bulkAction.mockResolvedValue(1);
    mocks.listShares.mockResolvedValue({ shares: [], complete: true });
    mocks.revokeShare.mockResolvedValue(undefined);
    mocks.listPublished.mockResolvedValue([]);
    mocks.unpublish.mockResolvedValue(undefined);
    mocks.historyStats.mockResolvedValue({
      conversationCount: 1,
      activeConversationCount: 1,
      messageCount: 1,
    });
    useChatStore.setState({
      conversations: [storeConversation],
      activeConversationId: null,
      streamingConversationIds: [],
      loadingConversationIds: [],
    });
  });

  afterEach(() => {
    observePreferenceOwner(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists archived chats and restores them through the real manager contract', async () => {
    render(<ArchivedChatsSection />);

    expect(await screen.findByText('Archived planning')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mocks.restoreArchived).toHaveBeenCalledWith(
        'conversation-1',
        expect.objectContaining({ organizationId: null }),
      ),
    );
    expect(screen.getByText('Restored “Archived planning”.')).toBeInTheDocument();
    expect(useChatStore.getState().conversations[0]?.isArchived).toBe(false);
  });

  it('puts a restored chat in the sidebar store even when it was never loaded there', async () => {
    useChatStore.setState({ conversations: [] });

    render(<ArchivedChatsSection />);

    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(useChatStore.getState().conversations).toHaveLength(1));
    const restored = useChatStore.getState().conversations[0];
    expect(restored?.id).toBe('conversation-1');
    expect(restored?.isArchived).toBe(false);
  });

  it('rebuilds a readable archived snapshot before admitting another page after restore', async () => {
    const next = { ...archivedConversation, id: 'conversation-2', title: 'Next chat' };
    mocks.listArchived
      .mockReset()
      .mockResolvedValueOnce({
        conversations: [archivedConversation],
        hasMore: true,
        nextOffset: 1,
      })
      .mockResolvedValueOnce({ conversations: [next], hasMore: true, nextOffset: 1 })
      .mockResolvedValue({ conversations: [], hasMore: false, nextOffset: 1 });
    render(<ArchivedChatsSection />);
    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByText('Next chat');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(mocks.listArchived).toHaveBeenLastCalledWith(1, undefined, expect.any(Object)),
    );
    expect(mocks.listArchived.mock.calls[1]?.[0]).toBe(0);
  });

  it('restores a deleted chat once, without a duplicate sidebar row', async () => {
    render(<DeletedChatsSection />);

    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mocks.restoreDeleted).toHaveBeenCalledWith(
        'conversation-1',
        expect.objectContaining({ organizationId: null }),
      ),
    );
    const rows = useChatStore.getState().conversations.filter(({ id }) => id === 'conversation-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isArchived).toBe(false);
  });

  it('rebuilds deleted pagination after a confirmed restore', async () => {
    const next = { ...archivedConversation, id: 'conversation-2', title: 'Next deleted chat' };
    mocks.listDeleted
      .mockReset()
      .mockResolvedValueOnce({
        conversations: [archivedConversation],
        hasMore: true,
        nextOffset: 1,
      })
      .mockResolvedValueOnce({ conversations: [next], hasMore: true, nextOffset: 1 })
      .mockResolvedValue({ conversations: [], hasMore: false, nextOffset: 1 });
    render(<DeletedChatsSection />);
    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByText('Next deleted chat');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(mocks.listDeleted).toHaveBeenLastCalledWith(1, undefined, expect.any(Object)),
    );
    expect(mocks.listDeleted.mock.calls[1]?.[0]).toBe(0);
  });

  it('moves every archived chat in the current workspace only after confirmation', async () => {
    render(<ArchivedChatsSection />);

    await screen.findByText('Archived planning');
    fireEvent.click(screen.getByRole('button', { name: 'Delete all archived' }));

    expect(mocks.bulkAction).not.toHaveBeenCalled();
    mocks.listArchived.mockResolvedValue({ conversations: [], hasMore: false, nextOffset: 0 });
    const buttons = screen.getAllByRole('button', { name: 'Delete all archived' });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() =>
      expect(mocks.bulkAction).toHaveBeenCalledWith(
        'delete_archived',
        expect.objectContaining({ organizationId: null }),
      ),
    );
    expect(await screen.findByText('No archived chats')).toBeInTheDocument();
  });

  it('lists and revokes account-owned shared links', async () => {
    mocks.listShares.mockResolvedValue({
      complete: true,
      shares: [
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
      ],
    });

    render(<SharedLinksSection />);

    expect(await screen.findByText('Shared planning')).toBeInTheDocument();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith(
      'https://agiworkforce.com/share/share-token',
      '_blank',
      'noopener,noreferrer',
    );
    expect(mocks.listShares).toHaveBeenCalledWith(
      expect.objectContaining({ session, assertCurrent: expect.any(Function) }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(mocks.revokeShare).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));

    await waitFor(() =>
      expect(mocks.revokeShare).toHaveBeenCalledWith(
        'share-token',
        expect.objectContaining({ session, assertCurrent: expect.any(Function) }),
      ),
    );
    expect(screen.getByText('No shared links')).toBeInTheDocument();
  });

  it('does not describe an incomplete empty inventory as having no shared links', async () => {
    mocks.listShares.mockResolvedValue({ shares: [], complete: false });

    render(<SharedLinksSection />);

    expect(await screen.findByText('No shared links shown')).toBeInTheDocument();
    expect(screen.getByText(/This list may be incomplete/)).toBeInTheDocument();
    expect(screen.queryByText('No shared links')).toBeNull();
  });

  it('keeps incomplete guidance after revoking the last displayed link', async () => {
    const shareUrl = 'https://agiworkforce.com/share/share-token';
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    mocks.listShares.mockResolvedValue({
      complete: false,
      shares: [
        {
          token: 'share-token',
          title: 'Shared planning',
          shareUrl,
          modelId: null,
          provider: null,
          messageCount: 3,
          visibility: 'public',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-08-01T00:00:00.000Z',
          expired: false,
        },
      ],
    });

    render(<SharedLinksSection />);

    await screen.findByText('Shared planning');
    expect(screen.getByText(/This list may be incomplete/)).toBeInTheDocument();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith(shareUrl, '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('Copied the link for “Shared planning”.');
    expect(writeText).toHaveBeenCalledWith(shareUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mocks.revokeShare).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByText('No shared links shown')).toBeInTheDocument();
    expect(mocks.revokeShare).toHaveBeenCalledWith(
      'share-token',
      expect.objectContaining({ session, assertCurrent: expect.any(Function) }),
    );
    expect(screen.getByText(/This list may be incomplete/)).toBeInTheDocument();
    expect(screen.queryByText('No shared links')).toBeNull();
    expect(mocks.listShares).toHaveBeenCalledTimes(1);
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
    expect(
      screen.getByText('Restore archived chats or move them to Recently deleted.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Restore archived chats or permanently delete them.')).toBeNull();

    expect(screen.getByRole('button', { name: 'Archive all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete all' })).toBeInTheDocument();
  });

  it('asks for the export archive and says the download link is emailed when it will be', async () => {
    vi.mocked(usePreferenceOwner).mockReturnValue(observePreferenceOwner(session));
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, _init?: RequestInit) =>
        String(input) === MANAGED_CLOUD_DATA_EXPORT_PATH
          ? new Response(
              JSON.stringify({
                archive: {
                  id: 'export-1',
                  status: 'preparing',
                  delivery: 'email',
                  requestedAt: '2026-09-28T10:00:00.000Z',
                  readyAt: null,
                  expiresAt: null,
                  volumes: [],
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          : new Response(
              JSON.stringify(
                String(input) === MANAGED_CLOUD_DATA_EXPORT_ARCHIVES_PATH ? { archive: null } : {},
              ),
              { headers: { 'Content-Type': 'application/json' } },
            ),
      );

    render(<PrivacySection />);
    expect(screen.getByText(/Download a copy of your account data and files/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        MANAGED_CLOUD_DATA_EXPORT_PATH,
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText(/email you a download link when it's ready/i),
    ).toBeInTheDocument();
  });
});

type MockedModule0 = typeof import('@/features/settings/hooks/use-preference-owner');
type MockedModule1 = typeof import('@/features/workspaces/hooks/use-workspaces');
type MockedModule2 = typeof import('@/app/settings/_lib/preferences-client');

type CsrfModule = typeof import('@/lib/client/csrf');
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'fixture-csrf' })),
}));
