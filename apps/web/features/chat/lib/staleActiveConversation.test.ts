import { describe, it, expect } from 'vitest';
import { isStaleActiveConversation } from './staleActiveConversation';

/**
 * Bug 3 (model-switch dialog over-triggers on an empty chat).
 *
 * The "Switch model mid-conversation?" warning reads the raw chat store
 * (activeConversationId + messages). Navigating back to the empty `/chat` home via a
 * route change (not the "New chat" button, which clears the store) leaves a prior
 * conversation active with its completed turns — so the warning fired on a genuinely
 * empty homepage (heading showing, only unsent draft text). The page reconciles this
 * by clearing the store when the view is empty; this predicate is that decision.
 */
describe('isStaleActiveConversation', () => {
  const base = { isStreaming: false, isLoading: false };

  it('is true when the view is empty but a conversation is still active (the bug)', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
      }),
    ).toBe(true);
  });

  it('is false on a genuinely fresh chat (nothing active) — no needless reset', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: null,
        activeConversationId: null,
      }),
    ).toBe(false);
  });

  it('is false while viewing a real conversation (ids match / non-empty view)', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: 'conv-abc',
        activeConversationId: 'conv-abc',
      }),
    ).toBe(false);
  });

  it('never resets mid-send or mid-stream (race guard on the first-message flow)', () => {
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: true,
        isLoading: false,
      }),
    ).toBe(false);
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: false,
        isLoading: true,
      }),
    ).toBe(false);
  });

  it('never resets while a send is in flight, even in the createConversation→bareChatSessionId gap (DEMO-BLOCKER)', () => {
    // Reproduces the exact first-turn race: createConversation has set the store
    // active + cleared messages and its own isLoading finally has already flipped
    // back to false, but bareChatSessionId has not committed yet (displayed id
    // still null) and the stream has not started (isStreaming false). Without the
    // isSending guard this returns true and nulls the just-created conversation,
    // which then makes the post-navigation loadConversation refetch orphan the
    // streaming assistant message so the first reply never renders until reload.
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: false,
        isLoading: false,
        isSending: true,
      }),
    ).toBe(false);
  });
});
