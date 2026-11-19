import {
  hasVisibleContent,
  isContinuableFinishReason,
  isMessageContinuable,
} from '@agiworkforce/unified-chat/continue-generation';
import { isAutoModeModelId } from '@agiworkforce/types';
import { STREAM_INTERRUPTED_FAILURE_CODE } from '@/services/streamConnectionLost';
import { isCloudManagedModelId, isFreeQuotaTurnModelId } from '@/src/features/model-picker/service';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import type { InFlightTurnVerdict } from '../inFlightTurnRecovery';
import { executionModeForConversation } from './conversationMode';
import { getMessageStreamErrorCode, hasMessageStreamError } from './messageStreamError';

const TURN_OVER: ReadonlySet<InFlightTurnVerdict> = new Set(['idle', 'stalled']);

function isInterruptedPartialAnswer(message: ChatMessage): boolean {
  return (
    message.role === 'assistant' &&
    !message.isStreaming &&
    getMessageStreamErrorCode(message) === STREAM_INTERRUPTED_FAILURE_CODE &&
    hasVisibleContent(message.content)
  );
}

/**
 * The model a cut-off cloud answer is continued with, or null when the answer
 * cannot be continued. A finish reason that names another ending (a tool
 * pause, a refusal, a failure) is never overruled by the cut-off reading of
 * the text, and a stopped answer is offered Try again rather than Continue,
 * as on web. Of the failed answers, only one whose stream was interrupted after
 * its text began is continued, from that text. Media, research and paused runs
 * each resume through their own flow. While the server may still be writing
 * the turn, Continue would start and bill a second answer, so it waits until
 * the turn is known to be over.
 */
export function continuableCloudModel(
  conversation: Pick<ConversationSummary, 'executionMode' | 'model' | 'provider'>,
  message: ChatMessage,
  turn: InFlightTurnVerdict = 'idle',
): string | null {
  if (!TURN_OVER.has(turn)) return null;
  if (executionModeForConversation(conversation) !== 'cloud') return null;
  if ((message.type ?? 'text') !== 'text' || message.status === 'error') return null;
  if (message.pendingToolInput) return null;
  if (message.toolCalls?.some((tool) => tool.status === 'awaiting-approval')) return null;
  if (message.metadata?.research || message.metadata?.agiWorkPlan) return null;
  const finishReason = message.metadata?.finishReason;
  if (finishReason === 'stopped') return null;
  if (hasMessageStreamError(message)) {
    if (!isInterruptedPartialAnswer(message)) return null;
  } else {
    if (finishReason !== undefined && finishReason !== 'stop') {
      if (!isContinuableFinishReason(finishReason)) return null;
    }
    if (!isMessageContinuable(message)) return null;
  }
  const model = message.model ?? conversation.model;
  if (!model || isFreeQuotaTurnModelId(model)) return null;
  return isCloudManagedModelId(model) || isAutoModeModelId(model) ? model : null;
}
