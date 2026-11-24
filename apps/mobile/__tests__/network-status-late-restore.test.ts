import { act, renderHookAsync } from '@testing-library/react-native';
import type { SendMessageOptions } from '@/stores/chatStore';

let mockRestore: (() => void) | undefined;
let mockAccountOwner: string | null = null;
const mockAccountListeners = new Set<() => void>();
const mockStorage = new Map<string, string>();
const mockWrite = jest.fn((key: string, value: string) => mockStorage.set(key, value));
type Reachability = { isConnected: boolean; isInternetReachable: boolean };
type ExecutionSnapshot = { streamingConversationIds: string[] };
type ModeSnapshot = { appMode: 'cloud' | 'local' };
let mockMode: ModeSnapshot = { appMode: 'cloud' };
const mockModeListeners = new Set<(state: ModeSnapshot, previous: ModeSnapshot) => void>();
let mockNetwork: Reachability = { isConnected: true, isInternetReachable: true };
const mockNetworkListeners = new Set<(state: Reachability) => void>();
const mockExecutionListeners = new Set<
  (state: ExecutionSnapshot, previous: ExecutionSnapshot) => void
>();
const mockBusyConversations = new Set<string>();
const mockChat = {
  sendMessage: jest.fn(
    async (
      _conversationId: string,
      _content: string,
      _model: string,
      _attachments: unknown,
      options: SendMessageOptions,
    ) => {
      if (mockBusyConversations.has(_conversationId)) {
        options.onOfflineReplayBusy?.();
        return false;
      }
      options.onAccepted?.();
      return true;
    },
  ),
  resolveOfflineMessage: jest.fn(),
  failOfflineMessage: jest.fn(),
};

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: (restore: () => void) => {
    mockRestore = restore;
  },
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockWrite(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: async () => mockNetwork,
    addEventListener: (listener: (state: Reachability) => void) => {
      mockNetworkListeners.add(listener);
      return () => mockNetworkListeners.delete(listener);
    },
  },
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockChat) => unknown) => selector(mockChat),
}));

jest.mock('@/stores/chat/chatExecutionStore', () => ({
  hasActiveConversationSend: (id: string) => mockBusyConversations.has(id),
  useChatExecutionStore: {
    subscribe: (listener: (state: ExecutionSnapshot, previous: ExecutionSnapshot) => void) => {
      mockExecutionListeners.add(listener);
      return () => mockExecutionListeners.delete(listener);
    },
  },
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => mockMode,
    subscribe: (listener: (state: ModeSnapshot, previous: ModeSnapshot) => void) => {
      mockModeListeners.add(listener);
      return () => mockModeListeners.delete(listener);
    },
  },
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () =>
    mockAccountOwner === null ? null : { ownerId: mockAccountOwner, epoch: 1 },
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number } | null) =>
    snapshot?.ownerId === mockAccountOwner && snapshot?.epoch === 1,
  subscribeCloudAccountEpochChange: (listener: () => void) => {
    mockAccountListeners.add(listener);
    return () => mockAccountListeners.delete(listener);
  },
}));

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { offlineQueue } from '@/services/offlineQueue';

it('replays a restored Cloud prompt once the account joins two already-online observers', async () => {
  const storedPrompt = {
    id: 'restored-prompt',
    conversationId: 'offline-conversation',
    content: 'Keep my draft across restart.',
    model: 'fixture-queued-model',
    queuedAt: '2026-11-01T00:00:00.000Z',
    retryCount: 0,
    provenance: { scope: 'cloud', ownerId: 'queued-account' },
  };
  mockStorage.set('offline_queue_v1', JSON.stringify([storedPrompt]));
  const first = await renderHookAsync(useNetworkStatus);
  const second = await renderHookAsync(useNetworkStatus);
  expect(first.result.current.isOnline).toBe(true);
  expect(second.result.current.isOnline).toBe(true);
  expect(mockChat.sendMessage).not.toHaveBeenCalled();
  expect(offlineQueue.getQueueSize()).toBe(0);

  await act(async () => {
    mockRestore?.();
  });
  expect(mockChat.sendMessage).not.toHaveBeenCalled();
  expect(first.result.current.queueSize).toBe(1);

  await act(async () => {
    mockAccountOwner = 'queued-account';
    mockAccountListeners.forEach((listener) => listener());
  });
  expect(mockChat.sendMessage).toHaveBeenCalledTimes(1);
  expect(mockChat.sendMessage).toHaveBeenCalledWith(
    storedPrompt.conversationId,
    storedPrompt.content,
    storedPrompt.model,
    undefined,
    expect.objectContaining({ onAccepted: expect.any(Function) }),
  );
  expect(mockChat.resolveOfflineMessage).toHaveBeenCalledWith(
    storedPrompt.conversationId,
    storedPrompt.id,
  );
  expect(offlineQueue.getQueueSize()).toBe(0);
  expect(first.result.current.queueSize).toBe(0);
  expect(second.result.current.queueSize).toBe(0);
});

it('keeps a busy prompt across observer remounts and replays it when that reply ends', async () => {
  offlineQueue.clear();
  mockChat.sendMessage.mockClear();
  mockChat.resolveOfflineMessage.mockClear();
  mockNetwork = { isConnected: false, isInternetReachable: false };
  mockBusyConversations.add('busy-thread');
  const scope = { scope: 'cloud' as const, ownerId: 'queued-account' };
  const busy = offlineQueue.enqueue({
    conversationId: 'busy-thread',
    content: 'Wait for this conversation.',
    model: 'fixture-queued-model',
    provenance: scope,
  });
  const other = offlineQueue.enqueue({
    conversationId: 'ready-thread',
    content: 'This one can proceed.',
    model: 'fixture-queued-model',
    provenance: scope,
  });
  const original = await renderHookAsync(useNetworkStatus);

  await act(async () => {
    mockNetwork = { isConnected: true, isInternetReachable: true };
    for (const listener of mockNetworkListeners) listener(mockNetwork);
  });

  expect(offlineQueue.getQueue()).toEqual([busy]);
  expect(busy.retryCount).toBe(0);
  expect(JSON.parse(mockStorage.get('offline_queue_v1') ?? '[]')[0]?.id).toBe(busy.id);
  expect(mockChat.resolveOfflineMessage.mock.calls).toEqual([[other.conversationId, other.id]]);
  await original.unmountAsync();
  await renderHookAsync(useNetworkStatus);
  expect(offlineQueue.getQueue()).toEqual([busy]);

  await act(async () => {
    const previous = mockMode;
    mockMode = { appMode: 'local' };
    mockModeListeners.forEach((listener) => listener(mockMode, previous));
    mockBusyConversations.delete('busy-thread');
    for (const listener of mockExecutionListeners) {
      listener({ streamingConversationIds: [] }, { streamingConversationIds: ['busy-thread'] });
    }
  });

  expect(offlineQueue.getQueue()).toEqual([busy]);
  expect(mockChat.sendMessage).toHaveBeenCalledTimes(2);

  await act(async () => {
    const previous = mockMode;
    mockMode = { appMode: 'cloud' };
    mockModeListeners.forEach((listener) => listener(mockMode, previous));
  });

  expect(offlineQueue.getQueueSize()).toBe(0);
  expect(mockChat.resolveOfflineMessage).toHaveBeenLastCalledWith(busy.conversationId, busy.id);
  expect(mockChat.sendMessage.mock.calls.map(([conversationId]) => conversationId)).toEqual([
    busy.conversationId,
    other.conversationId,
    busy.conversationId,
  ]);
});

it('leaves the queue unchanged if device storage does not retain a new prompt', () => {
  offlineQueue.clear();
  mockWrite.mockImplementationOnce(() => mockStorage);
  expect(() =>
    offlineQueue.enqueue({
      conversationId: 'offline-conversation',
      content: 'This should stay in the composer.',
      model: 'fixture-queued-model',
      provenance: { scope: 'cloud', ownerId: 'queued-account' },
    }),
  ).toThrow('storage-unavailable');
  expect(offlineQueue.getQueueSize()).toBe(0);
});

it('retains the saved prompt without dispatch when replay IDs cannot be written', async () => {
  offlineQueue.clear();
  const saved = offlineQueue.enqueue({
    conversationId: 'offline-conversation',
    content: 'Keep the original queue entry.',
    model: 'fixture-queued-model',
    provenance: { scope: 'cloud', ownerId: 'queued-account' },
  });
  mockWrite.mockImplementationOnce(() => mockStorage);
  const send = jest.fn().mockResolvedValue(undefined);

  await offlineQueue.processQueue(send);

  expect(send).not.toHaveBeenCalled();
  expect(offlineQueue.getQueue()).toEqual([saved]);
  expect(saved.replayIdentity).toBeUndefined();
  expect(saved.retryCount).toBe(0);
  offlineQueue.clear();
});

it('refuses a new prompt at capacity without discarding an older saved one', () => {
  offlineQueue.clear();
  const payload = {
    conversationId: 'offline-conversation',
    model: 'fixture-queued-model',
    provenance: { scope: 'cloud' as const, ownerId: 'queued-account' },
  };
  for (let index = 0; index < 100; index += 1) {
    offlineQueue.enqueue({ ...payload, content: `Saved prompt ${index}` });
  }
  const saved = offlineQueue.getQueue();
  expect(() => offlineQueue.enqueue({ ...payload, content: 'Unsent draft' })).toThrow('queue-full');
  expect(offlineQueue.getQueue()).toEqual(saved);
  expect(JSON.parse(mockStorage.get('offline_queue_v1') ?? '[]')[0]?.content).toBe(
    'Saved prompt 0',
  );
  offlineQueue.clear();
});
