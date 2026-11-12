jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  apiFetch: jest.fn(),
}));

const mockUnloadLocalModels = jest.fn();
jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual<Record<string, unknown>>('@agiworkforce/local-llm'),
  unloadLocalModels: (...args: unknown[]) => mockUnloadLocalModels(...args),
}));

import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import {
  releaseLocalModelMemory,
  useLocalModelMemoryRelease,
} from '../src/features/model-picker/useLocalModelMemoryRelease';
import { feedbackMailtoUrl } from '../src/features/feedback';
import { SUPPORT_EMAIL } from '../src/features/support/contact';

const localId = 'conv_local_interrupted';
const conversation: ConversationSummary = {
  id: localId,
  title: 'Local chat',
  updatedAt: '2026-11-11T00:00:00.000Z',
  createdAt: '2026-11-11T00:00:00.000Z',
  messageCount: 3,
  pinned: false,
  executionMode: 'local',
};

type PersistedSlice = { messages: Record<string, ChatMessage[]> };

function persistedMessages(messages: ChatMessage[]): ChatMessage[] {
  const partialize = useChatMessageStore.persist.getOptions().partialize;
  if (!partialize) throw new Error('chat message store has no partialize');
  const slice = partialize({
    ...useChatMessageStore.getState(),
    conversations: [conversation],
    messages: { [localId]: messages },
  }) as PersistedSlice;
  return slice.messages[localId] ?? [];
}

describe('Local chat persistence when the app is killed mid-reply', () => {
  it('keeps a partial local reply and marks it stopped', () => {
    const saved = persistedMessages([
      { id: 'u1', role: 'user', content: 'Explain tides' } as ChatMessage,
      {
        id: 'a1',
        role: 'assistant',
        content: 'Tides come from the pull of',
        isStreaming: true,
      } as ChatMessage,
    ]);

    expect(saved.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(saved[1]?.isStreaming).toBe(false);
    expect(saved[1]?.content).toBe('Tides come from the pull of');
    expect(saved[1]?.metadata?.finishReason).toBe('stopped');
  });

  it('drops a streaming reply that has no text yet', () => {
    const saved = persistedMessages([
      { id: 'u1', role: 'user', content: 'Hello' } as ChatMessage,
      { id: 'a1', role: 'assistant', content: '', isStreaming: true } as ChatMessage,
    ]);

    expect(saved.map((message) => message.id)).toEqual(['u1']);
  });
});

describe('Local Mode feedback', () => {
  it('addresses the support inbox with the chosen kind and the typed message', () => {
    const url = feedbackMailtoUrl('bug', 'Stop & retry loses text?');

    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('subject')).toBe('Bug Report');
    expect(query.get('body')).toBe('Stop & retry loses text?');
  });
});

describe('Local model memory release', () => {
  beforeEach(() => {
    mockUnloadLocalModels.mockReset();
  });

  it('reports a busy model instead of throwing', async () => {
    mockUnloadLocalModels.mockRejectedValueOnce(new Error('ExecuTorch is busy.'));
    await expect(releaseLocalModelMemory()).resolves.toBe(false);
    mockUnloadLocalModels.mockResolvedValueOnce(undefined);
    await expect(releaseLocalModelMemory()).resolves.toBe(true);
  });

  it('unloads on a memory warning and when the app goes to the background', () => {
    const listeners = new Map<string, (state?: string) => void>();
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((type, listener) => {
        listeners.set(type, listener as (state?: string) => void);
        return { remove: jest.fn() };
      });
    mockUnloadLocalModels.mockResolvedValue(undefined);

    const { unmount } = renderHook(() => useLocalModelMemoryRelease());
    listeners.get('memoryWarning')?.();
    listeners.get('change')?.('inactive');
    listeners.get('change')?.('background');

    expect(mockUnloadLocalModels).toHaveBeenCalledTimes(2);
    unmount();
    addEventListener.mockRestore();
  });
});
