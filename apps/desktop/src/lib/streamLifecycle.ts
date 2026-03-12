import type { EnhancedMessage } from '../stores/chat/types';
import type { MessageLookupSnapshot } from './messageLookup';
import { findMessageById } from './messageLookup';
import { resolveTranscriptMessageId } from './runtimeMessageOwnership';

export interface StreamTargetResolutionInput {
  resolvedTargetId: string | null;
  currentStreamingMessageId: string | null;
  currentMatchesSession: boolean;
  conversationMessages: EnhancedMessage[];
}

export interface StreamTargetResolutionResult {
  finalizedMessageId: string | null;
  hasValidTarget: boolean;
}

export interface ActiveStreamMessageResolutionInput {
  conversationMessages: EnhancedMessage[];
  sessionMessageId?: string | null;
  payloadMessageId?: string | number | null;
  currentStreamingMessageId?: string | null;
}

export function resolveActiveStreamMessageId(
  snapshot: MessageLookupSnapshot,
  input: ActiveStreamMessageResolutionInput,
): string | null {
  const normalizedPayloadId =
    input.payloadMessageId === undefined || input.payloadMessageId === null
      ? null
      : String(input.payloadMessageId);

  if (
    input.sessionMessageId &&
    input.conversationMessages.some((message) => message.id === input.sessionMessageId)
  ) {
    return input.sessionMessageId;
  }

  if (
    normalizedPayloadId &&
    input.conversationMessages.some((message) => String(message.id) === normalizedPayloadId)
  ) {
    return normalizedPayloadId;
  }

  if (
    input.currentStreamingMessageId &&
    input.conversationMessages.some(
      (message) => String(message.id) === String(input.currentStreamingMessageId),
    )
  ) {
    return input.currentStreamingMessageId;
  }

  const transcriptTargetMessageId = resolveTranscriptMessageId(
    input.conversationMessages,
    input.currentStreamingMessageId ?? null,
    {
      allowStreamingAssistantFallback: true,
    },
  );
  if (transcriptTargetMessageId) {
    return transcriptTargetMessageId;
  }

  if (input.sessionMessageId && findMessageById(snapshot, input.sessionMessageId)) {
    return input.sessionMessageId;
  }

  if (normalizedPayloadId && findMessageById(snapshot, normalizedPayloadId)) {
    return normalizedPayloadId;
  }

  return null;
}

export function resolveTerminalStreamTarget({
  resolvedTargetId,
  currentStreamingMessageId,
  currentMatchesSession,
  conversationMessages,
}: StreamTargetResolutionInput): StreamTargetResolutionResult {
  if (resolvedTargetId) {
    return {
      finalizedMessageId: resolvedTargetId,
      hasValidTarget: true,
    };
  }

  if (currentStreamingMessageId && currentMatchesSession) {
    return {
      finalizedMessageId: currentStreamingMessageId,
      hasValidTarget: true,
    };
  }

  const fallbackStreamingMessage = [...conversationMessages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.metadata?.streaming);

  return {
    finalizedMessageId: fallbackStreamingMessage?.id ?? null,
    hasValidTarget: fallbackStreamingMessage !== undefined,
  };
}

export function buildCompletedStreamMessageUpdate(input: {
  totalTokens?: number;
  costCents?: number;
}): Partial<EnhancedMessage> {
  return {
    metadata: {
      streaming: false,
      tokenCount: input.totalTokens,
      cost: input.costCents ? input.costCents / 100 : undefined,
    },
  };
}

export function buildStreamingStateMessageUpdate(input: {
  streaming: boolean;
  status?: string;
  label?: string;
}): Partial<EnhancedMessage> {
  return {
    metadata: {
      streaming: input.streaming,
      ...(input.status ? { status: input.status } : {}),
      ...(input.label ? { label: input.label } : {}),
    },
  };
}

export function buildToolCallMessageUpdate(input: {
  toolName: string;
  toolCallId: string;
}): Partial<EnhancedMessage> {
  return {
    metadata: {
      tool: input.toolName,
      tool_call: input.toolCallId,
      actionId: input.toolCallId,
      name: input.toolName,
      status: 'running',
      streaming: true,
    },
  };
}

export function buildToolResultStateMessageUpdate(input: {
  success: boolean;
}): Partial<EnhancedMessage> {
  return {
    metadata: {
      status: input.success ? 'completed' : 'failed',
      streaming: false,
    },
  };
}

export function buildFailedStreamMessageUpdate(input: {
  displayError: string;
  rawError: string;
}): Partial<EnhancedMessage> {
  return {
    content: input.displayError,
    metadata: {
      streaming: false,
    },
    error: input.rawError,
  };
}
