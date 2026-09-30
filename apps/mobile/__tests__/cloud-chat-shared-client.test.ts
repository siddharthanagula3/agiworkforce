import { Alert } from 'react-native';

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockGuardedFetch = jest.fn();
jest.mock('../lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
  isOurCloudHost: () => true,
  OUR_CLOUD_HOSTS: ['agiworkforce.com'],
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

jest.mock('../services/authSession', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({}),
  getAuthToken: jest.fn().mockResolvedValue(null),
  clearAuthSession: jest.fn().mockResolvedValue(undefined),
  refreshAuthSession: jest.fn().mockResolvedValue(false),
}));

import {
  MANAGED_CLOUD_CHAT_BASE_PATH,
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
} from '@agiworkforce/cloud-contracts';
import {
  clearCloudConversationPagination,
  useChatMessageStore,
} from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useAuthStore } from '../src/features/auth/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const T = '2026-06-20T00:00:00.000Z';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function seedCloudConversation(id: string): void {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id}`,
    createdAt: T,
    updatedAt: T,
    messageCount: 0,
    pinned: false,
  });
}

function cloudConversationExists(id: string): boolean {
  return useChatCloudMessageStore.getState().conversations.some((c) => c.id === id);
}

function requestUrls(): string[] {
  return mockGuardedFetch.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({
    conversations: [],
    messages: {},
    currentConversationId: null,
    conversationLoadError: null,
  });
  useChatAppModeStore.getState().setAppMode('cloud');
  useAuthStore.setState({ isClerkSignedIn: true, isClerkLoaded: true });
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
});

describe('mobile cloud chat goes through the shared managed-cloud client', () => {
  it('accepts a JSON-bodied 404 delete as already deleted instead of retrying and restoring', async () => {
    seedCloudConversation('c1');
    mockGuardedFetch.mockResolvedValue(jsonResponse(404, { error: 'Conversation not found' }));

    await useChatMessageStore.getState().deleteConversation('c1');

    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
    expect(cloudConversationExists('c1')).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('still retries a JSON-bodied 500 delete and restores the row when it never succeeds', async () => {
    seedCloudConversation('c2');
    mockGuardedFetch.mockResolvedValue(jsonResponse(500, { error: 'Database unavailable' }));

    await useChatMessageStore.getState().deleteConversation('c2');

    expect(mockGuardedFetch).toHaveBeenCalledTimes(3);
    expect(cloudConversationExists('c2')).toBe(true);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('lists conversations on the shared base path with the archived filter', async () => {
    mockGuardedFetch.mockResolvedValue(
      jsonResponse(200, { conversations: [], hasMore: false, nextOffset: 0 }),
    );

    await useChatMessageStore.getState().loadConversations();

    const url = requestUrls()[0] ?? '';
    expect(url).toContain(`${MANAGED_CLOUD_CHAT_BASE_PATH}?`);
    expect(url).toContain('archived=exclude');
  });

  it('reports a failed history refresh instead of presenting an empty account as current', async () => {
    mockGuardedFetch.mockRejectedValue(new Error('Network unavailable'));

    await useChatMessageStore.getState().loadConversations();

    expect(useChatMessageStore.getState().isLoadingConversations).toBe(false);
    expect(useChatMessageStore.getState().conversationLoadError).toContain(
      'could not be refreshed',
    );

    mockGuardedFetch.mockResolvedValue(
      jsonResponse(200, { conversations: [], hasMore: false, nextOffset: 0 }),
    );
    await useChatMessageStore.getState().loadConversations();
    expect(useChatMessageStore.getState().conversationLoadError).toBeNull();
  });

  it("reports an inactive Cloud account without requesting another account's history", async () => {
    invalidateCloudAccount();

    await useChatMessageStore.getState().loadConversations({ firstPageOnly: true });

    expect(mockGuardedFetch).not.toHaveBeenCalled();
    expect(useChatMessageStore.getState().conversationLoadError).toContain(
      'could not be refreshed',
    );
  });

  it('shows the first Cloud history page before later pages finish', async () => {
    const firstConversation = {
      id: '0190a000-0000-7000-8000-0000000000aa',
      title: 'First page chat',
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: T,
      updated_at: T,
    };
    let resolveSecondPage: (response: Response) => void = () => undefined;
    mockGuardedFetch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [firstConversation],
          hasMore: true,
          nextOffset: 1,
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondPage = resolve;
          }),
      );

    const loading = useChatMessageStore.getState().loadConversations();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useChatCloudMessageStore.getState().conversations).toMatchObject([
      { id: firstConversation.id, title: 'First page chat' },
    ]);
    expect(useChatMessageStore.getState().isLoadingConversations).toBe(true);

    resolveSecondPage(jsonResponse(200, { conversations: [], hasMore: false, nextOffset: 1 }));
    await loading;
    expect(useChatMessageStore.getState().isLoadingConversations).toBe(false);
  });

  it('defers older Cloud history until the list asks for another page', async () => {
    const firstConversation = {
      id: '0190a000-0000-7000-8000-0000000000ee',
      title: 'Newest chat',
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: T,
      updated_at: T,
    };
    mockGuardedFetch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [firstConversation],
          hasMore: true,
          nextOffset: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [{ ...firstConversation, id: '0190a000-0000-7000-8000-0000000000ff' }],
          hasMore: false,
          nextOffset: 2,
        }),
      );

    await useChatMessageStore.getState().loadConversations({ firstPageOnly: true });
    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(true);
    expect(useChatCloudMessageStore.getState().conversations).toHaveLength(1);

    await useChatMessageStore.getState().loadMoreConversations();
    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(false);
    expect(useChatCloudMessageStore.getState().conversations).toHaveLength(2);
  });

  it('keeps older Cloud history retryable after a page request fails', async () => {
    mockGuardedFetch
      .mockResolvedValueOnce(jsonResponse(200, { conversations: [], hasMore: true, nextOffset: 1 }))
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(
        jsonResponse(200, { conversations: [], hasMore: false, nextOffset: 1 }),
      );

    await useChatMessageStore.getState().loadConversations({ firstPageOnly: true });
    await useChatMessageStore.getState().loadMoreConversations();
    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(true);
    expect(useChatMessageStore.getState().conversationLoadError).toContain('Older chats');

    await useChatMessageStore.getState().loadMoreConversations();
    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(false);
    expect(useChatMessageStore.getState().conversationLoadError).toBeNull();
  });

  it('discards a demand-loaded page when the account changes during the request', async () => {
    let resolveOlderPage: (response: Response) => void = () => undefined;
    mockGuardedFetch
      .mockResolvedValueOnce(jsonResponse(200, { conversations: [], hasMore: true, nextOffset: 1 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOlderPage = resolve;
          }),
      );

    await useChatMessageStore.getState().loadConversations({ firstPageOnly: true });
    const loading = useChatMessageStore.getState().loadMoreConversations();
    await new Promise((resolve) => setTimeout(resolve, 0));
    activateCloudAccount('account-b');
    useChatCloudMessageStore.getState().clearCloudData();
    resolveOlderPage(
      jsonResponse(200, {
        conversations: [
          {
            id: '0190a000-0000-7000-8000-000000000011',
            title: 'Previous account older chat',
            model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: T,
            updated_at: T,
          },
        ],
        hasMore: false,
        nextOffset: 2,
      }),
    );
    await loading;

    expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(false);
    expect(useChatMessageStore.getState().conversationLoadError).toBeNull();
  });

  it('forgets a pending older-page cursor when Cloud account state is cleared', async () => {
    mockGuardedFetch.mockResolvedValueOnce(
      jsonResponse(200, { conversations: [], hasMore: true, nextOffset: 1 }),
    );
    await useChatMessageStore.getState().loadConversations({ firstPageOnly: true });

    clearCloudConversationPagination();
    await useChatMessageStore.getState().loadMoreConversations();

    expect(useChatMessageStore.getState().hasMoreCloudConversations).toBe(false);
    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
  });

  it('discards a history response that arrives after the Cloud account changes', async () => {
    let resolveFirstPage: (response: Response) => void = () => undefined;
    mockGuardedFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirstPage = resolve;
        }),
    );

    const loading = useChatMessageStore.getState().loadConversations();
    await new Promise((resolve) => setTimeout(resolve, 0));
    activateCloudAccount('account-b');
    resolveFirstPage(
      jsonResponse(200, {
        conversations: [
          {
            id: '0190a000-0000-7000-8000-0000000000bb',
            title: 'Previous account chat',
            model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: T,
            updated_at: T,
          },
        ],
        hasMore: false,
        nextOffset: 1,
      }),
    );
    await loading;

    expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    expect(useChatMessageStore.getState().conversationLoadError).toBeNull();
    expect(useChatMessageStore.getState().isLoadingConversations).toBe(false);
  });

  it('does not append a later history page after the Cloud account changes', async () => {
    const accountAConversation = {
      id: '0190a000-0000-7000-8000-0000000000cc',
      title: 'Account A chat',
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: T,
      updated_at: T,
    };
    let resolveSecondPage: (response: Response) => void = () => undefined;
    mockGuardedFetch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [accountAConversation],
          hasMore: true,
          nextOffset: 1,
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondPage = resolve;
          }),
      );

    const loading = useChatMessageStore.getState().loadConversations();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useChatCloudMessageStore.getState().conversations).toHaveLength(1);

    activateCloudAccount('account-b');
    useChatCloudMessageStore.getState().clearCloudData();
    resolveSecondPage(
      jsonResponse(200, {
        conversations: [{ ...accountAConversation, id: '0190a000-0000-7000-8000-0000000000dd' }],
        hasMore: false,
        nextOffset: 2,
      }),
    );
    await loading;

    expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    expect(useChatMessageStore.getState().conversationLoadError).toBeNull();
  });
});
