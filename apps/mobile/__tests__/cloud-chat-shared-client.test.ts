import { Alert } from 'react-native';

jest.mock('../lib/mmkv', () => ({
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

import { MANAGED_CLOUD_CHAT_BASE_PATH } from '@agiworkforce/cloud-contracts';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useAuthStore } from '../src/features/auth/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';

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
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
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
});
