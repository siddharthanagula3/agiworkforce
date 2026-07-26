import { beforeEach, describe, expect, it } from 'vitest';
import {
  useChatStore,
  selectConversationMessages,
  selectIsActiveConversationStreaming,
  selectIsConversationLoading,
  selectIsConversationStreaming,
} from './web-chat-store';

describe('chatStore — ambient managed search', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('enables Web search for every new managed conversation by default', () => {
    expect(useChatStore.getState().getComposerToggles('conv-new').webSearchEnabled).toBe(true);
  });

  it('drops the legacy persisted opt-out during the v3 migration', async () => {
    const migrate = useChatStore.persist.getOptions().migrate;
    expect(migrate).toBeDefined();

    const migrated = await migrate!(
      { webSearchByDefault: false, sidebarCollapsed: true } as never,
      2,
    );

    expect(migrated).toMatchObject({ sidebarCollapsed: true });
    expect(migrated).not.toHaveProperty('webSearchByDefault');
  });
});

describe('chatStore — per-conversation transcript scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("keeps a background conversation's message updates out of the active transcript", () => {
    const { setActiveConversationWithMessages, updateMessage, setActiveConversation } =
      useChatStore.getState();
    const createdAt = '2026-07-25T00:00:00.000Z';

    setActiveConversationWithMessages('conv-a', [
      { id: 'assistant-1', role: 'assistant', content: 'A partial', createdAt },
    ]);
    setActiveConversationWithMessages('conv-b', [
      { id: 'assistant-1', role: 'assistant', content: 'B answer', createdAt },
    ]);

    // Conversation A finishes after the user has navigated to B. The ids are
    // deliberately identical so only the explicit conversation scope can
    // prevent the background update from touching B's visible message.
    updateMessage('assistant-1', { content: 'A complete' }, 'conv-a');

    const stateWhileBIsActive = useChatStore.getState();
    expect(stateWhileBIsActive.messages).toEqual([
      { id: 'assistant-1', role: 'assistant', content: 'B answer', createdAt },
    ]);
    expect(selectConversationMessages('conv-a')(stateWhileBIsActive)[0]?.content).toBe(
      'A complete',
    );
    expect(selectConversationMessages('conv-b')(stateWhileBIsActive)[0]?.content).toBe('B answer');

    setActiveConversation('conv-a');
    expect(useChatStore.getState().messages[0]?.content).toBe('A complete');
  });
});

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

  it("keys route UI to the URL conversation before the store's active id catches up", () => {
    const { startStreaming, setLoading } = useChatStore.getState();

    useChatStore.setState({ activeConversationId: 'conv-a' });
    startStreaming('msg-a', 'conv-a');
    setLoading(true, 'conv-a');

    const stateDuringRouteTransition = useChatStore.getState();
    expect(selectIsActiveConversationStreaming(stateDuringRouteTransition)).toBe(true);
    expect(selectIsConversationStreaming('conv-b')(stateDuringRouteTransition)).toBe(false);
    expect(selectIsConversationLoading('conv-b')(stateDuringRouteTransition)).toBe(false);
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

describe('chatStore — per-conversation error scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('ignores a late error from a conversation after the user switches chats', () => {
    const { setActiveConversationWithMessages, setError } = useChatStore.getState();

    setActiveConversationWithMessages('conv-a', []);
    setError('Request failed: 504', 'conv-a');
    expect(useChatStore.getState().error).toBe('Request failed: 504');

    setActiveConversationWithMessages('conv-b', []);
    expect(useChatStore.getState().error).toBeNull();

    // Conversation A's request settles after B is already visible. Its error
    // belongs in A's failed assistant turn, never in B's top banner.
    setError('Request failed: 504', 'conv-a');
    expect(useChatStore.getState().error).toBeNull();

    setError('B failed', 'conv-b');
    expect(useChatStore.getState().error).toBe('B failed');
  });
});
