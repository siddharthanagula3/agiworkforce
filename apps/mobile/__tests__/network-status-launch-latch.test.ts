import { act, renderHookAsync } from '@testing-library/react-native';
import type { QueuedMessage } from '@/services/offlineQueue';

type Reachability = { isConnected: boolean; isInternetReachable: boolean };
let mockNetworkListener: ((state: Reachability) => void) | undefined;
const mockFetch = jest.fn();
const mockProcessQueue = jest.fn();
const mockEntry: QueuedMessage = {
  id: 'launch-race-entry',
  conversationId: 'launch-race-conversation',
  content: 'Keep this queued after the failed attempt.',
  model: 'fixture-queued-model',
  queuedAt: '2026-11-01T00:00:00.000Z',
  retryCount: 0,
  provenance: { scope: 'local' },
};
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
        if (mockNetworkListener === listener) mockNetworkListener = undefined;
      };
    },
  },
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (select: (state: typeof mockChatState) => unknown) => select(mockChatState),
}));
jest.mock('@/services/offlineQueue', () => ({
  offlineQueue: {
    processQueue: (send: (entry: QueuedMessage) => Promise<void>, isReady: () => boolean) =>
      mockProcessQueue(send, isReady),
    getQueue: () => [mockEntry],
    getQueueSize: () => 1,
    subscribe: () => () => {},
    onEntryFailed: () => () => {},
  },
}));

import { useNetworkStatus } from '@/hooks/useNetworkStatus';

// This standalone suite starts with a fresh module-owned launch latch.
it('consumes launch replay on a listener-first attempt without retrying on a later mount', async () => {
  let finishFetch!: (state: Reachability) => void;
  let finishBackoff!: () => void;
  const backoff = new Promise<void>((resolve) => {
    finishBackoff = resolve;
  });
  mockFetch.mockReturnValue(
    new Promise<Reachability>((resolve) => {
      finishFetch = resolve;
    }),
  );
  mockChatState.sendMessage.mockRejectedValue(new Error('First send failed'));
  mockProcessQueue.mockImplementation(
    async (send: (entry: QueuedMessage) => Promise<void>, isReady: () => boolean) => {
      if (!isReady()) return;
      await expect(send(mockEntry)).rejects.toThrow('First send failed');
      await backoff;
    },
  );

  const original = await renderHookAsync(useNetworkStatus);
  await act(async () => {
    mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
  });
  expect(mockProcessQueue).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishFetch({ isConnected: true, isInternetReachable: true });
    finishBackoff();
    await mockProcessQueue.mock.results[0]?.value;
  });
  await original.unmount();

  mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  await renderHookAsync(useNetworkStatus);

  expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  expect(mockChatState.sendMessage).toHaveBeenCalledTimes(1);
});
