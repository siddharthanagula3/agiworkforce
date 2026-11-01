import { act, renderHookAsync } from '@testing-library/react-native';
import type { QueuedMessage } from '@/services/offlineQueue';
import type { SendMessageOptions } from '@/stores/chatStore';

type Reachability = { isConnected: boolean; isInternetReachable: boolean };
let mockNetworkListener: ((state: Reachability) => void) | undefined;
let mockEntries: QueuedMessage[] = [];
const mockFetch = jest.fn();
const mockProcessQueue = jest.fn();
const mockChatState = {
  sendMessage: jest.fn(),
  resolveOfflineMessage: jest.fn(),
  failOfflineMessage: jest.fn(),
};

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () => mockFetch(),
    addEventListener: (listener: (state: Reachability) => void) => {
      mockNetworkListener = listener;
      return () => {
        mockNetworkListener = undefined;
      };
    },
  },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (select: (state: typeof mockChatState) => unknown) => select(mockChatState),
}));
jest.mock('@/services/offlineQueue', () => ({
  offlineQueue: {
    processQueue: (send: (entry: QueuedMessage) => Promise<void>) => mockProcessQueue(send),
    getQueueSize: () => mockEntries.length,
    subscribe: () => () => {},
    onEntryFailed: () => () => {},
  },
}));

import { useNetworkStatus } from '@/hooks/useNetworkStatus';

function queuedIntent(skillName?: string) {
  return {
    id: 'queued-1',
    conversationId: 'conversation-1',
    content: 'Run the queued intent.',
    model: 'fixture-queued-model',
    queuedAt: '2026-11-01T00:00:00.000Z',
    retryCount: 0,
    provenance: { scope: 'cloud' as const, ownerId: 'queue-owner' },
    ...(skillName ? { skillName } : {}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkListener = undefined;
  mockEntries = [];
  mockFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
  mockChatState.sendMessage.mockImplementation(
    async (
      _conversationId: string,
      _content: string,
      _model: string,
      _attachments: unknown,
      options?: SendMessageOptions,
    ) => {
      options?.onAccepted?.();
      return true;
    },
  );
  mockProcessQueue.mockImplementation(async (send: (entry: QueuedMessage) => Promise<void>) => {
    for (const entry of [...mockEntries]) await send(entry);
    mockEntries = [];
  });
});

it('replays a restored skill selection on an already-online launch', async () => {
  mockEntries = [queuedIntent('restored-skill')];
  mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  await renderHookAsync(useNetworkStatus);

  expect(mockChatState.sendMessage).toHaveBeenCalledWith(
    'conversation-1',
    'Run the queued intent.',
    'fixture-queued-model',
    undefined,
    expect.objectContaining({ skillName: 'restored-skill', onAccepted: expect.any(Function) }),
  );
  expect(mockChatState.resolveOfflineMessage).toHaveBeenCalledWith('conversation-1', 'queued-1');
});

it('forwards the queued skill when internet access returns', async () => {
  mockEntries = [queuedIntent('queued-skill')];
  const { result } = await renderHookAsync(useNetworkStatus);
  expect(result.current.isOnline).toBe(false);
  await act(async () => {
    mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
  });

  expect(mockChatState.sendMessage).toHaveBeenCalledWith(
    'conversation-1',
    'Run the queued intent.',
    'fixture-queued-model',
    undefined,
    expect.objectContaining({ skillName: 'queued-skill' }),
  );
  expect(mockProcessQueue).toHaveBeenCalledTimes(1);
});

it('keeps legacy queued turns without a skill selection unchanged', async () => {
  mockEntries = [queuedIntent()];
  await renderHookAsync(useNetworkStatus);
  await act(async () => {
    mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
  });

  expect(mockChatState.sendMessage).toHaveBeenCalledTimes(1);
  expect(mockChatState.sendMessage.mock.calls[0]?.[4]).not.toHaveProperty('skillName');
});
