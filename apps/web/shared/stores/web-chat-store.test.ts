import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore, selectIsActiveConversationStreaming } from './web-chat-store';

/**
 * Regression coverage for the cross-conversation streaming-flag leak
 * (streaming/approval cluster Finding 5): `isStreaming`/`isLoading` used to
 * be plain global booleans, so switching conversations mid-stream either (a)
 * showed a brand-new/switched-to conversation as falsely "generating" (stale
 * true left over from the conversation navigated away from), or (b) an
 * orphaned background stream's completion callback wiped a genuinely-active
 * NEW stream's flag out from under it. See `streamingConversationIds`'s doc
 * comment on ChatState for the fix shape (mirrors mobile's chatExecutionStore).
 */
describe('chatStore — per-conversation streaming scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('switching to a different conversation does not show it as falsely streaming', () => {
    const { startStreaming, setActiveConversationWithMessages } = useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false); // no active id yet

    useChatStore.setState({ activeConversationId: 'conv-a' });
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);

    // Switch to a conversation with no live stream of its own.
    setActiveConversationWithMessages('conv-b', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
    // A's stream is still genuinely running in the background.
    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-a']);
  });

  it("an orphaned background stream's completion does not wipe a genuinely-active new stream's flag", () => {
    const { startStreaming, stopStreaming, setLoading, setActiveConversationWithMessages } =
      useChatStore.getState();

    // Conversation A starts streaming (every real caller pairs startStreaming
    // with setLoading(true)), then the user switches to B and sends there
    // too, so B has its own genuinely-live send in flight when A's finally
    // completes in the background.
    startStreaming('msg-a', 'conv-a');
    setLoading(true);
    setActiveConversationWithMessages('conv-b', []);
    startStreaming('msg-b', 'conv-b');
    setLoading(true);

    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true); // B is active + streaming
    expect(useChatStore.getState().streamingConversationIds.sort()).toEqual(['conv-a', 'conv-b']);
    expect(useChatStore.getState().isLoading).toBe(true);

    // A's background stream now completes -- its teardown must scope to A.
    stopStreaming('conv-a');
    setLoading(false, 'conv-a');

    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-b']);
    // B (the currently active, genuinely-streaming conversation) is untouched.
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  it('switching back to a conversation whose stream is still live re-shows it as streaming', () => {
    const { startStreaming, setActiveConversationWithMessages } = useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    setActiveConversationWithMessages('conv-b', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);

    setActiveConversationWithMessages('conv-a', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  it('user-initiated stop (no conversationId) targets only the active conversation', () => {
    const { startStreaming, stopStreaming, setActiveConversationWithMessages } =
      useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    setActiveConversationWithMessages('conv-b', []);
    startStreaming('msg-b', 'conv-b');

    // stopGeneration() calls stopStreaming() with no argument.
    stopStreaming();

    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-a']);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);
  });
});
