'use client';

import type { LocalChatMessage, LocalModel } from '@agiworkforce/local-runtime-contract';
import { cancelLocalChat, startLocalChat } from '@features/desktop-host';
import { createFrameCoalescedAppender } from '@/lib/client/frame-coalesced-appender';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';

export const LOCAL_ATTACHMENTS_UNSUPPORTED =
  'Files are not sent to a model on this device yet. Remove the attachment, or pick a cloud model.';
export const LOCAL_TURN_IN_CLOUD_CHAT =
  'This chat already holds answers from a model on this device. Start a new chat to continue with a cloud model, so nothing local is uploaded.';

export function conversationHoldsLocalTurns(messages: readonly Message[]): boolean {
  return messages.some((message) => message.metadata?.privacyMode === 'local');
}

/**
 * The turns a local model is given.
 *
 * Only plain text crosses: the local servers are addressed tool-free, and an
 * attachment is refused at the composer rather than silently dropped here.
 */
export function toLocalChatMessages(
  messages: readonly Message[],
  excludeMessageId: string,
): LocalChatMessage[] {
  return messages
    .filter(
      (message) =>
        message.id !== excludeMessageId &&
        (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
        typeof message.content === 'string' &&
        message.content.trim() !== '',
    )
    .map((message) => ({
      role: message.role as LocalChatMessage['role'],
      content: message.content,
    }));
}

export interface LocalTurnInput {
  conversationId: string;
  assistantMessageId: string;
  model: LocalModel;
  messages: LocalChatMessage[];
  signal: AbortSignal;
}

export interface LocalTurnOutcome {
  text: string;
  stopReason: string;
  error: string | null;
}

/**
 * Answers one turn on this machine and writes it into the transcript.
 *
 * Nothing here calls the completions route, reserves managed compute, or
 * persists the answer: a local turn carries no usage figures because none were
 * spent, and it is not uploaded because uploading it is the thing the Local
 * boundary rules out.
 */
export async function runLocalTurn(input: LocalTurnInput): Promise<LocalTurnOutcome> {
  const store = useChatStore.getState();
  const { appendToMessage, appendToThinking, updateMessage } = store;
  const appender = createFrameCoalescedAppender({
    onFlush: (kind, messageId, text) => {
      if (kind === 'thinking') appendToThinking(messageId, text, input.conversationId);
      else appendToMessage(messageId, text, input.conversationId);
    },
  });

  const run = startLocalChat({ modelId: input.model.id, messages: input.messages }, (delta) => {
    appender.append(
      delta.channel === 'thinking' ? 'thinking' : 'content',
      input.assistantMessageId,
      delta.delta,
    );
  });

  const abort = () => {
    void cancelLocalChat(run.runId);
  };
  input.signal.addEventListener('abort', abort);

  try {
    const result = await run.result;
    appender.flush();

    const failed = result.stopReason === 'error' || result.stopReason === 'timeout';
    updateMessage(
      input.assistantMessageId,
      {
        isStreaming: false,
        model: input.model.id,
        metadata: {
          privacyMode: 'local',
          providerMode: 'Local',
          model: input.model.name,
          provider: input.model.serverLabel,
          finishReason: result.stopReason,
          ...(result.thinking.trim() !== ''
            ? { thinkingContent: result.thinking, isThinkingStreaming: false }
            : {}),
        },
      },
      input.conversationId,
    );

    return {
      text: result.text,
      stopReason: result.stopReason,
      error: failed ? (result.message ?? 'That local model did not finish the answer.') : null,
    };
  } finally {
    input.signal.removeEventListener('abort', abort);
    appender.flush();
  }
}
