export interface StaleActiveConversationInput {
  displayedConversationId: string | null | undefined;
  activeConversationId: string | null | undefined;
  isStreaming: boolean;
  isLoading: boolean;
  isSending?: boolean;
}

export function isStaleActiveConversation(input: StaleActiveConversationInput): boolean {
  const { displayedConversationId, activeConversationId, isStreaming, isLoading, isSending } =
    input;
  if (isStreaming || isLoading || isSending) return false;
  if (displayedConversationId) return false;
  return Boolean(activeConversationId);
}

export interface ConversationRoutePendingInput {
  displayedConversationId: string | null | undefined;
  activeConversationId: string | null | undefined;
  displayedMessageCount: number;
  authLoaded: boolean;
  isConversationLoading: boolean;
}

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

export function isConversationListPending(input: {
  authLoaded: boolean;
  isConversationLoading: boolean;
  conversationCount: number;
}): boolean {
  return !input.authLoaded || (input.conversationCount === 0 && input.isConversationLoading);
}
