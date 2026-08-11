/**
 * Stale active-conversation detection for the web chat store.
 *
 * The chat store (`@shared/stores/web-chat-store`) holds a single `activeConversationId` +
 * `messages` pair. The page renders the *displayed* conversation off
 * `displayedConversationId = urlConversationId ?? bareChatSessionId`, and
 * `displayedMessages` is gated on `activeConversationId === displayedConversationId`
 * — so a stale store (a prior conversation still `active` after the user navigated
 * back to the empty `/chat` home via a route change rather than the "New chat"
 * button, which DOES clear the store) is invisible in the message list.
 *
 * It is NOT invisible to `ComposerFooter`, which reads the raw store to decide
 * whether switching models should warn "Switch model mid-conversation?". With a
 * stale active id + completed assistant turns still in `messages`, that warning
 * fires on the empty homepage (heading showing, only unsent draft text) — the
 * DEMO-BLOCKER. `ComposerFooter` cannot distinguish stale from real (the store
 * genuinely says a conversation with turns is active), so the reconciliation must
 * happen at the page: when the view is the empty/new-chat state, clear the store.
 *
 * Pure predicate so the reset condition is unit-testable without mounting the page.
 */
export interface StaleActiveConversationInput {
  /** `urlConversationId ?? bareChatSessionId` — the conversation the page is showing. */
  displayedConversationId: string | null | undefined;
  /** The chat store's currently-active conversation id. */
  activeConversationId: string | null | undefined;
  /** True while an SSE stream is generating (never reset mid-stream). */
  isStreaming: boolean;
  /** True while a send is in flight (never reset mid-send). */
  isLoading: boolean;
  /**
   * True for the whole duration of a `sendContent` call — set synchronously
   * BEFORE `createConversation` mutates the store. `isStreaming`/`isLoading`
   * alone leave a race window: a brand-new-chat send calls `createConversation`
   * (which sets `activeConversationId` and toggles `isLoading` back off in its
   * own `finally`) and only THEN commits `bareChatSessionId`. In the render
   * between those steps the store is active, `displayedConversationId` is still
   * null, and neither stream nor load flag is set — which this predicate would
   * otherwise misread as a stale homepage and clear, orphaning the first
   * turn's streaming assistant message. Treat an in-flight send as never stale.
   */
  isSending?: boolean;
}

/**
 * Whether the store's active conversation is stale relative to the empty view and
 * should be cleared. True only when there is genuinely nothing displayed
 * (`!displayedConversationId`) yet the store still marks a conversation active,
 * AND no send/stream is in flight (so we never race the first-message flow, which
 * sets `bareChatSessionId` → `displayedConversationId` before appending messages).
 */
export function isStaleActiveConversation(input: StaleActiveConversationInput): boolean {
  const { displayedConversationId, activeConversationId, isStreaming, isLoading, isSending } =
    input;
  if (isStreaming || isLoading || isSending) return false;
  if (displayedConversationId) return false;
  return Boolean(activeConversationId);
}

export interface ConversationRoutePendingInput {
  /** The conversation named by the current URL/view. */
  displayedConversationId: string | null | undefined;
  /** The transcript currently active in the chat store. */
  activeConversationId: string | null | undefined;
  /** Number of messages already available for the displayed conversation. */
  displayedMessageCount: number;
  /** Clerk has resolved whether the viewer is signed in. */
  authLoaded: boolean;
  /** Conversation list/create/open work reported by useConversations. */
  isConversationLoading: boolean;
}

/**
 * Whether a URL-owned conversation is waiting for its transcript.
 *
 * A direct reload initially has a route id but no active store transcript. The
 * async auth/load effects start only after that first paint, so relying on the
 * hook's loading flag alone briefly renders the brand-new-chat greeting. Route
 * ownership is synchronous: while the route has no matching transcript, show
 * the existing conversation skeleton. Once any messages are available they win
 * immediately, even if the independent sidebar list fetch is still running.
 */
export function isConversationRoutePending(input: ConversationRoutePendingInput): boolean {
  const {
    displayedConversationId,
    activeConversationId,
    displayedMessageCount,
    authLoaded,
    isConversationLoading,
  } = input;

  if (!displayedConversationId || displayedMessageCount > 0) return false;
  return !authLoaded || isConversationLoading || activeConversationId !== displayedConversationId;
}

/**
 * Keep the sidebar honest before auth can start its first conversation-list
 * fetch. Once real conversations are present, an unrelated create/open request
 * must not replace them with a loading placeholder.
 */
export function isConversationListPending(input: {
  authLoaded: boolean;
  isConversationLoading: boolean;
  conversationCount: number;
}): boolean {
  return !input.authLoaded || (input.conversationCount === 0 && input.isConversationLoading);
}
