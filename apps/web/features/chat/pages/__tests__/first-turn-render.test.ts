import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type Message } from '@/stores/chatStore';
import { isStaleActiveConversation } from '@features/chat/lib/staleActiveConversation';

/**
 * DEMO-BLOCKER regression: the FIRST message of a NEW chat must stream and render
 * the assistant reply live, without a manual reload.
 *
 * Root cause (confirmed live): a brand-new-chat `sendContent` runs
 * `createConversation` (which sets the store's `activeConversationId` and clears
 * messages, and whose own `isLoading` finally flips back to false) and only THEN
 * commits `bareChatSessionId`. In the render between those two steps the store is
 * active, `displayedConversationId` is still null, and neither `isStreaming` nor
 * `isLoading` is set — so the stale-active reconciler misread it as a stale
 * homepage and nulled `activeConversationId`. That desync made the
 * post-navigation `loadConversation` refetch fire (`urlConversationId !==
 * activeConversationId`) and replace the in-flight `[user, assistant-streaming]`
 * pair with the server copy `[user]`, orphaning the streaming assistant message.
 *
 * The fix holds an `isSending` guard for the whole send so the reconciler never
 * clears the just-created conversation. This test drives the REAL chat store
 * through the exact runtime sequence, with the router replace and the
 * loadConversation refetch mocked, and asserts the streaming assistant message
 * survives the conversation-id navigation.
 */
describe('new-chat first turn (post-send navigation retention)', () => {
  const CONV_ID = 'conv-fresh-123';

  beforeEach(() => {
    useChatStore.getState().reset();
    vi.clearAllMocks();
  });

  /**
   * Mirror of the page's route-effect refetch guard
   * (`urlConversationId !== activeConversationId`). The `loadConversation` mock
   * performs the real clobber it would do server-side (user persisted, assistant
   * not yet), so if the guard wrongly allows it the streaming assistant is lost.
   */
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

    // sendContent sets the guard synchronously BEFORE createConversation.
    let isSending = true;

    // 1) createConversation: store becomes active + messages cleared; its own
    //    isLoading finally has already flipped back to false.
    store().setActiveConversation(CONV_ID);
    let bareChatSessionId: string | null = null; // committed only AFTER this call

    // 2) The reconciler runs in the gap: active is set, displayed id is still
    //    null, no stream/load in flight. WITH the fix (isSending=true) it must
    //    NOT clear the active conversation.
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

    // 3) bareChatSessionId commits; URL replace is issued.
    bareChatSessionId = CONV_ID;
    router.replace(`/chat/${CONV_ID}`);

    // 4) sendMessage appends the user message + the streaming assistant message.
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

    // 5) Navigation remounts the page at /chat/[id]; the route effect runs with
    //    the fresh url. Because active was preserved it equals the url, so the
    //    refetch guard is false and loadConversation must NOT fire.
    runRouteEffect(CONV_ID);
    expect(loadConversation).not.toHaveBeenCalled();

    // 6) A stream token lands on the assistant message and renders live.
    store().appendToMessage('assistant-1', 'Average speed is 40 mph.');

    // Retention: both messages present, assistant kept + populated.
    const finalMessages = store().messages;
    expect(finalMessages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const assistant = finalMessages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Average speed is 40 mph.');

    // displayedMessages gate (mirror): active === displayed id, so the stream shows.
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

    // Reproduce the pre-fix predicate (no isSending): reconciler misfires.
    const staleInGap = isStaleActiveConversation({
      displayedConversationId: bareChatSessionId,
      activeConversationId: store().activeConversationId,
      isStreaming: store().isStreaming,
      isLoading: store().isLoading,
      // isSending omitted → undefined, exactly the old behavior
    });
    expect(staleInGap).toBe(true);
    store().setActiveConversation(null); // the destructive clear

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

    // active(null) !== url(CONV_ID) → refetch fires and clobbers to [user].
    runRouteEffect(CONV_ID);
    expect(loadConversation).toHaveBeenCalledWith(CONV_ID);
    expect(store().messages.map((m) => m.role)).toEqual(['user']);
    expect(store().messages.find((m) => m.role === 'assistant')).toBeUndefined();
  });
});
