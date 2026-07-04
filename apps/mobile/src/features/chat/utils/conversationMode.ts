import { isCloudManagedModelId } from '@/src/features/model-picker/service';
import type { ConversationSummary } from '@/types/chat';

export type ConversationExecutionMode = 'local' | 'cloud';

export function executionModeForModel(modelId?: string | null): ConversationExecutionMode {
  return modelId && isCloudManagedModelId(modelId) ? 'cloud' : 'local';
}

export function providerForExecutionMode(
  mode: ConversationExecutionMode,
): 'local' | 'cloud_managed' {
  return mode === 'cloud' ? 'cloud_managed' : 'local';
}

export function executionModeForConversation(
  conversation: Pick<ConversationSummary, 'executionMode' | 'model' | 'provider'>,
): ConversationExecutionMode {
  if (conversation.executionMode === 'cloud' || conversation.executionMode === 'local') {
    return conversation.executionMode;
  }
  if (conversation.provider === 'cloud_managed') return 'cloud';
  return executionModeForModel(conversation.model);
}

/**
 * Temporary/incognito conversations must never surface in history listings
 * (recents, search, full history, chat-count stats) even though the active
 * chat screen still looks them up directly by id. Use this in every
 * "list of past conversations" surface, not in single-conversation lookups.
 */
export function isHistoryVisibleConversation(
  conversation: Pick<ConversationSummary, 'temporary'>,
): boolean {
  return !conversation.temporary;
}
