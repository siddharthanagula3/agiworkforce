import { isCloudManagedModelId } from '@/src/features/model-picker/service';
import { isAutoModeModelId } from '@agiworkforce/types';
import type { ConversationSummary } from '@/types/chat';

export type ConversationExecutionMode = 'local' | 'cloud';

export function executionModeForModel(modelId?: string | null): ConversationExecutionMode {
  return modelId && isCloudManagedModelId(modelId) ? 'cloud' : 'local';
}

export function executionModeForSelection(
  modelId: string | null | undefined,
  activeMode: ConversationExecutionMode,
): ConversationExecutionMode {
  return isAutoModeModelId(modelId) ? activeMode : executionModeForModel(modelId);
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

export function isHistoryVisibleConversation(
  conversation: Pick<ConversationSummary, 'temporary'>,
): boolean {
  return !conversation.temporary;
}
