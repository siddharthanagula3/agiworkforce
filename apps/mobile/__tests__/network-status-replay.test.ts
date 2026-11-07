import { act, renderHookAsync } from '@testing-library/react-native';
import type { QueuedMessage } from '@/services/offlineQueue';
import type { SendMessageOptions } from '@/stores/chatStore';

type Reachability = { isConnected: boolean; isInternetReachable: boolean };
let mockNetworkListener: ((state: Reachability) => void) | undefined;
const mockNetworkListeners = new Set<(state: Reachability) => void>();
let mockEntries: QueuedMessage[] = [];
let mockAccountEpoch = 1;
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
      mockNetworkListeners.add(listener);
      return () => {
        mockNetworkListeners.delete(listener);
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
    getQueue: () => [...mockEntries],
    getQueueSize: () => mockEntries.length,
    subscribe: () => () => {},
    onEntryFailed: () => () => {},
  },
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'queue-owner', epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (account: { ownerId: string; epoch: number } | null) =>
    account?.ownerId === 'queue-owner' && account.epoch === mockAccountEpoch,
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
  mockNetworkListeners.clear();
  mockEntries = [];
  mockAccountEpoch = 1;
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
  mockProcessQueue.mockImplementation(
    async (send: (entry: QueuedMessage) => Promise<void>, isReady: () => boolean) => {
      for (const entry of [...mockEntries]) {
        if (!isReady()) break;
        await send(entry);
        mockEntries = mockEntries.filter((candidate) => candidate !== entry);
      }
    },
  );
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

it('ignores an initial online fetch after a newer offline listener observation', async () => {
  mockEntries = [queuedIntent()];
  let finishFetch!: (state: Reachability) => void;
  mockFetch.mockReturnValue(
    new Promise<Reachability>((resolve) => {
      finishFetch = resolve;
    }),
  );
  const { result } = await renderHookAsync(useNetworkStatus);

  await act(async () => {
    mockNetworkListener?.({ isConnected: false, isInternetReachable: false });
    finishFetch({ isConnected: true, isInternetReachable: true });
  });

  expect(result.current.isOnline).toBe(false);
  expect(mockProcessQueue).not.toHaveBeenCalled();
  expect(mockChatState.sendMessage).not.toHaveBeenCalled();
});

it('orders initial fetch publications across separate hook instances', async () => {
  let finishOlderFetch!: (state: Reachability) => void;
  mockFetch
    .mockReturnValueOnce(
      new Promise<Reachability>((resolve) => {
        finishOlderFetch = resolve;
      }),
    )
    .mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
  const older = await renderHookAsync(useNetworkStatus);
  const newer = await renderHookAsync(useNetworkStatus);

  await act(async () => {
    finishOlderFetch({ isConnected: true, isInternetReachable: true });
  });

  expect(older.result.current.isOnline).toBe(false);
  expect(newer.result.current.isOnline).toBe(false);
  expect(mockProcessQueue).not.toHaveBeenCalled();
});

it('allows a newer initial fetch to supersede an older fetch that completed first', async () => {
  let finishOlderFetch!: (state: Reachability) => void;
  let finishNewerFetch!: (state: Reachability) => void;
  mockFetch
    .mockReturnValueOnce(
      new Promise<Reachability>((resolve) => {
        finishOlderFetch = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise<Reachability>((resolve) => {
        finishNewerFetch = resolve;
      }),
    );
  const older = await renderHookAsync(useNetworkStatus);
  const newer = await renderHookAsync(useNetworkStatus);

  await act(async () => {
    finishOlderFetch({ isConnected: true, isInternetReachable: true });
  });
  expect(older.result.current.isOnline).toBe(true);
  await act(async () => {
    finishNewerFetch({ isConnected: false, isInternetReachable: false });
  });

  expect(newer.result.current.isOnline).toBe(false);
  expect(mockProcessQueue).not.toHaveBeenCalled();
});

it('does not publish a fetch or retained listener after its hook unmounts', async () => {
  mockEntries = [queuedIntent()];
  let finishFetch!: (state: Reachability) => void;
  mockFetch.mockReturnValue(
    new Promise<Reachability>((resolve) => {
      finishFetch = resolve;
    }),
  );
  const hook = await renderHookAsync(useNetworkStatus);
  const staleListener = mockNetworkListener;
  await hook.unmount();

  await act(async () => {
    staleListener?.({ isConnected: true, isInternetReachable: true });
    finishFetch({ isConnected: true, isInternetReachable: true });
  });

  expect(mockProcessQueue).not.toHaveBeenCalled();
  expect(mockChatState.sendMessage).not.toHaveBeenCalled();
});

it('keeps processor readiness across navigation and observes surviving subscribers', async () => {
  const second = { ...queuedIntent(), id: 'queued-2', content: 'second' };
  mockEntries = [queuedIntent(), second];
  let finishSend!: () => void;
  mockChatState.sendMessage.mockImplementationOnce(
    (
      _conversationId: string,
      _content: string,
      _model: string,
      _attachments: unknown,
      options: SendMessageOptions,
    ) =>
      new Promise<boolean>((resolve) => {
        finishSend = () => {
          options.onAccepted?.();
          resolve(true);
        };
      }),
  );
  const original = await renderHookAsync(useNetworkStatus);
  await act(async () => {
    mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
  });
  const isReady = mockProcessQueue.mock.calls[0]?.[1] as () => boolean;
  expect(isReady()).toBe(true);

  await original.unmount();
  expect(isReady()).toBe(true);
  let finishSuccessorFetch!: (state: Reachability) => void;
  mockFetch.mockReturnValue(
    new Promise<Reachability>((resolve) => {
      finishSuccessorFetch = resolve;
    }),
  );
  await renderHookAsync(useNetworkStatus);
  expect(isReady()).toBe(true);

  await act(async () => {
    for (const listener of mockNetworkListeners) {
      listener({ isConnected: false, isInternetReachable: false });
    }
  });
  expect(isReady()).toBe(false);
  expect(mockProcessQueue).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishSuccessorFetch({ isConnected: true, isInternetReachable: true });
    finishSend();
    await mockProcessQueue.mock.results[0]?.value;
  });

  expect(isReady()).toBe(false);
  expect(mockChatState.sendMessage).toHaveBeenCalledTimes(1);
  expect(mockEntries).toEqual([second]);
});

it.each(['current', 'cleared', 'changed-account'] as const)(
  'retains acceptance after unmount while guarding %s placeholder ownership',
  async (ownership) => {
    mockEntries = [queuedIntent()];
    let accept!: () => void;
    let rejectSend!: (error: Error) => void;
    mockChatState.sendMessage.mockImplementation(
      (
        _conversationId: string,
        _content: string,
        _model: string,
        _attachments: unknown,
        options: SendMessageOptions,
      ) => {
        accept = options.onAccepted!;
        return new Promise<boolean>((_resolve, reject) => {
          rejectSend = reject;
        });
      },
    );
    const hook = await renderHookAsync(useNetworkStatus);
    await act(async () => {
      mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
    });
    const processing = mockProcessQueue.mock.results[0]?.value as Promise<void>;
    await hook.unmount();
    if (ownership === 'cleared') mockEntries = [{ ...queuedIntent() }];
    if (ownership === 'changed-account') mockAccountEpoch += 1;

    await act(async () => {
      accept();
      rejectSend(new Error('Stream failed after admission'));
      await expect(processing).resolves.toBeUndefined();
    });

    expect(mockChatState.sendMessage).toHaveBeenCalledTimes(1);
    if (ownership === 'current') {
      expect(mockChatState.resolveOfflineMessage).toHaveBeenCalledWith(
        'conversation-1',
        'queued-1',
      );
    } else {
      expect(mockChatState.resolveOfflineMessage).not.toHaveBeenCalled();
    }
  },
);
