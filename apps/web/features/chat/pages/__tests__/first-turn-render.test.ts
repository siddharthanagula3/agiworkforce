import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { isStaleActiveConversation } from '@features/chat/lib/staleActiveConversation';

describe('new-chat first turn (post-send navigation retention)', () => {
  const CONV_ID = 'conv-fresh-123';

  beforeEach(() => {
    useChatStore.getState().reset();
    vi.clearAllMocks();
  });

  const loadConversation = vi.fn(async (id: string) => {
    const serverMessages: Message[] = [
      { id: 'user-1', role: 'user', content: 'hi', createdAt: new Date().toISOString() },
    ];
    useChatStore.getState().setActiveConversationWithMessages(id, serverMessages);
    return true;
  });
  const router = { replace: vi.fn() };

  function runRouteEffect(urlConversationId: string | undefined) {
    if (!urlConversationId) return;
    const active = useChatStore.getState().activeConversationId;
    if (urlConversationId !== active) {
      void loadConversation(urlConversationId);
    }
  }

  it('retains the streaming assistant message through the createConversation→navigate flow', () => {
    const store = useChatStore.getState;

    let isSending = true;

    store().setActiveConversation(CONV_ID);
    let bareChatSessionId: string | null = null;

    const staleInGap = isStaleActiveConversation({
      displayedConversationId: bareChatSessionId,
      activeConversationId: store().activeConversationId,
      isStreaming: store().isStreaming,
      isLoading: store().isLoading,
      isSending,
    });
    expect(staleInGap).toBe(false);
    if (staleInGap) store().setActiveConversation(null);
    expect(store().activeConversationId).toBe(CONV_ID);

    bareChatSessionId = CONV_ID;
    router.replace(`/chat/${CONV_ID}`);

    store().addMessage({
      id: 'user-1',
      role: 'user',
      content: 'hi',
      createdAt: new Date().toISOString(),
    });
    store().addMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
    });

    runRouteEffect(CONV_ID);
    expect(loadConversation).not.toHaveBeenCalled();

    store().appendToMessage('assistant-1', 'Average speed is 40 mph.');

    const finalMessages = store().messages;
    expect(finalMessages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const assistant = finalMessages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Average speed is 40 mph.');

    const displayed =
      bareChatSessionId && store().activeConversationId === bareChatSessionId
        ? store().messages
        : [];
    expect(displayed).toHaveLength(2);

    isSending = false;
  });

  it('WITHOUT the guard the reconciler nulls active and loadConversation clobbers the stream (documents the bug)', () => {
    const store = useChatStore.getState;

    store().setActiveConversation(CONV_ID);
    const bareChatSessionId: string | null = null;

    const staleInGap = isStaleActiveConversation({
      displayedConversationId: bareChatSessionId,
      activeConversationId: store().activeConversationId,
      isStreaming: store().isStreaming,
      isLoading: store().isLoading,
      // isSending omitted → undefined, exactly the old behavior
    });
    expect(staleInGap).toBe(true);
    store().setActiveConversation(null);

    store().addMessage({
      id: 'user-1',
      role: 'user',
      content: 'hi',
      createdAt: new Date().toISOString(),
    });
    store().addMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
    });

    runRouteEffect(CONV_ID);
    expect(loadConversation).toHaveBeenCalledWith(CONV_ID);
    expect(store().messages.map((m) => m.role)).toEqual(['user']);
    expect(store().messages.find((m) => m.role === 'assistant')).toBeUndefined();
  });
});
