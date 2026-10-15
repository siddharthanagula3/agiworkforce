import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
  openSavedConversation: vi.fn(),
  selectConversation: vi.fn(),
  privacyMode: 'local' as 'local' | 'managed',
  desktop: {
    activeConversationId: 'chat-a' as string | null,
    conversations: [{ id: 'chat-a' }, { id: 'chat-b' }],
  },
  shared: {
    isStreaming: false,
    messagesByConversation: {
      'chat-a': [
        { id: '10', role: 'assistant', content: 'stored', metadata: { feedback: 'up' } },
        { id: 'live-reply', role: 'assistant', content: 'new' },
      ],
    } as Record<string, Array<Record<string, unknown>>>,
  },
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: mocks.invoke,
}));
vi.mock('../../../hooks/useTTS', async (importOriginal) => ({
  ...(await importOriginal<UsettsModule>()),
  useTTS: () => ({ speakWithBargeIn: mocks.speak, stopNative: mocks.stop }),
}));
vi.mock('../../../stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppmodestoreModule>();
  return {
    ...actual,
    selectPrivacyMode: (state: { privacyMode: string }) => state.privacyMode,
    useAppModeStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector({ privacyMode: mocks.privacyMode }),
      actual.useAppModeStore,
    ),
  };
});
vi.mock('../../../stores/chat/chatStore', async (importOriginal) => {
  const useChatStore = (selector: (state: unknown) => unknown) => selector(mocks.desktop);
  useChatStore.getState = () => ({
    ...mocks.desktop,
    openSavedConversation: mocks.openSavedConversation,
    selectConversation: mocks.selectConversation,
  });
  return {
    ...(await importOriginal<ChatstoreModule>()),
    resolveDesktopChatOwnerId: () => 'local-desktop-user',
    useChatStore,
    uuidToDbId: (id: string) => ({ 'chat-a': 1, 'chat-b': 2 })[id],
  };
});
vi.mock('@agiworkforce/unified-chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector(mocks.shared),
  useChatModelStore: (selector: (state: unknown) => unknown) => selector({ models: [] }),
}));

import { useTauriMessageActions } from '../useTauriMessageActions';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type UsettsModule = typeof import('../../../hooks/useTTS');
type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type ChatstoreModule = typeof import('../../../stores/chat/chatStore');

describe('useTauriMessageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'local';
    mocks.desktop.activeConversationId = 'chat-a';
    mocks.speak.mockResolvedValue(undefined);
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'chat_list_conversation_branches') {
        return [{ messageId: 10, clientId: null, conversationIds: [1, 2], activeIndex: 0 }];
      }
      return undefined;
    });
  });

  it('shows stored ratings and saves a new one by the id the reply has', async () => {
    const { result } = renderHook(() => useTauriMessageActions());
    expect(result.current.feedbackByMessageId).toEqual({ '10': 'up' });

    act(() => result.current.onFeedback?.('live-reply', 'down'));

    expect(result.current.feedbackByMessageId).toEqual({ '10': 'up', 'live-reply': 'down' });
    expect(mocks.invoke).toHaveBeenCalledWith('chat_set_message_feedback', {
      conversationId: 1,
      userId: 'local-desktop-user',
      id: null,
      clientId: 'live-reply',
      feedback: 'down',
    });
  });

  it('takes a rating back and says so when it cannot be saved', async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'chat_set_message_feedback') throw new Error('locked');
      return [];
    });
    const { result } = renderHook(() => useTauriMessageActions());

    act(() => result.current.onFeedback?.('10', null));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(result.current.feedbackByMessageId).toEqual({ '10': 'up' });
  });

  it('branches into a new chat and opens it', async () => {
    const branch = { id: 3, title: 'Plan', created_at: 'x', updated_at: 'x', user_id: 'u' };
    mocks.invoke.mockImplementation(async (command: string) =>
      command === 'chat_branch_conversation' ? branch : [],
    );
    const { result } = renderHook(() => useTauriMessageActions());

    act(() => result.current.onBranch?.('10'));

    await waitFor(() => expect(mocks.openSavedConversation).toHaveBeenCalledWith(branch));
    expect(mocks.invoke).toHaveBeenCalledWith('chat_branch_conversation', {
      conversationId: 1,
      userId: 'local-desktop-user',
      messageId: 10,
      clientId: null,
    });
  });

  it('pages between the original and its branches at the shared reply', async () => {
    const { result } = renderHook(() => useTauriMessageActions());

    await waitFor(() => expect(result.current.getVariantPager?.('10')).not.toBeNull());
    const pager = result.current.getVariantPager!('10')!;
    expect(pager).toMatchObject({ index: 0, total: 2, disabled: false });
    expect(result.current.getVariantPager!('live-reply')).toBeNull();

    pager.onNext();
    expect(mocks.selectConversation).toHaveBeenCalledWith('chat-b');
  });

  it('offers only read aloud in Managed Cloud', () => {
    mocks.privacyMode = 'managed';
    const { result } = renderHook(() => useTauriMessageActions());

    expect(result.current.onReadAloud).toBeTypeOf('function');
    expect(result.current.onFeedback).toBeUndefined();
    expect(result.current.onBranch).toBeUndefined();
    expect(result.current.getVariantPager).toBeUndefined();
  });

  it('reads a reply aloud and stops it from the same control', () => {
    mocks.speak.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTauriMessageActions());

    act(() => result.current.onReadAloud?.('10', 'stored'));
    expect(result.current.readingAloudMessageId).toBe('10');

    act(() => result.current.onReadAloud?.('10', 'stored'));
    expect(mocks.stop).toHaveBeenCalled();
    expect(result.current.readingAloudMessageId).toBeNull();
  });
});
