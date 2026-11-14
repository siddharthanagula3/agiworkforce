import {
  isContinuableFinishReason,
  isMessageContinuable,
} from '@agiworkforce/unified-chat/continue-generation';
import { isAutoModeModelId } from '@agiworkforce/types';
import { isCloudManagedModelId, isFreeQuotaTurnModelId } from '@/src/features/model-picker/service';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { executionModeForConversation } from './conversationMode';
import { hasMessageStreamError } from './messageStreamError';

/**
 * The model a cut-off cloud answer is continued with, or null when the answer
 * cannot be continued. A finish reason that names another ending (a tool
 * pause, a refusal, a failure) is never overruled by the cut-off reading of
 * the text, and a stopped answer is offered Try again rather than Continue,
 * as on web. Media, research and paused runs each resume through their own
 * flow.
 */
export function continuableCloudModel(
  conversation: Pick<ConversationSummary, 'executionMode' | 'model' | 'provider'>,
  message: ChatMessage,
): string | null {
  if (executionModeForConversation(conversation) !== 'cloud') return null;
  if ((message.type ?? 'text') !== 'text' || message.status === 'error') return null;
  if (hasMessageStreamError(message) || message.pendingToolInput) return null;
  if (message.toolCalls?.some((tool) => tool.status === 'awaiting-approval')) return null;
  if (message.metadata?.research || message.metadata?.agiWorkPlan) return null;
  const finishReason = message.metadata?.finishReason;
  if (finishReason === 'stopped') return null;
  if (finishReason !== undefined && finishReason !== 'stop') {
    if (!isContinuableFinishReason(finishReason)) return null;
  }
  if (!isMessageContinuable(message)) return null;
  const model = message.model ?? conversation.model;
  if (!model || isFreeQuotaTurnModelId(model)) return null;
  return isCloudManagedModelId(model) || isAutoModeModelId(model) ? model : null;
}
