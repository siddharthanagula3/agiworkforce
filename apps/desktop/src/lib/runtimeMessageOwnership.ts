import type { EnhancedMessage } from '../stores/chat/types';

export interface RuntimeMessageOwnershipSnapshot {
  activeConversationId?: string | null;
  messagesByConversation?: Record<string, EnhancedMessage[] | undefined>;
  messages?: EnhancedMessage[];
  currentStreamingMessageId?: string | null;
}

export interface TranscriptMessageResolutionOptions {
  allowStreamingAssistantFallback?: boolean;
}

export function getActiveConversationMessages(
  snapshot: RuntimeMessageOwnershipSnapshot,
): EnhancedMessage[] {
  const activeConversationId = snapshot.activeConversationId;
  if (activeConversationId && snapshot.messagesByConversation?.[activeConversationId]) {
    return snapshot.messagesByConversation[activeConversationId] ?? [];
  }

  return snapshot.messages ?? [];
}

export function resolveTranscriptMessageId(
  messages: EnhancedMessage[],
  currentStreamingMessageId?: string | null,
  options: TranscriptMessageResolutionOptions = {},
): string | null {
  if (messages.length === 0) {
    return null;
  }

  const normalizedStreamingMessageId =
    currentStreamingMessageId === undefined || currentStreamingMessageId === null
      ? null
      : String(currentStreamingMessageId);

  if (
    normalizedStreamingMessageId &&
    messages.some((message) => String(message.id) === normalizedStreamingMessageId)
  ) {
    return normalizedStreamingMessageId;
  }

  if (options.allowStreamingAssistantFallback) {
    const streamingAssistant = messages.find(
      (message) =>
        message.role === 'assistant' &&
        (message.metadata?.streaming === true || message.streaming === true),
    );
    if (streamingAssistant) {
      return streamingAssistant.id;
    }
  }

  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (latestAssistant) {
    return latestAssistant.id;
  }

  const latestSystem = [...messages].reverse().find((message) => message.role === 'system');
  return latestSystem?.id ?? null;
}

export function resolveActiveConversationMessageId(
  snapshot: RuntimeMessageOwnershipSnapshot,
  options?: TranscriptMessageResolutionOptions,
): string | null {
  return resolveTranscriptMessageId(
    getActiveConversationMessages(snapshot),
    snapshot.currentStreamingMessageId,
    options,
  );
}
