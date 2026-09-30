import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { pickReadyLocalModelId } from '@/src/features/model-picker/installStore';
import { executionModeForSelection, type ConversationExecutionMode } from './conversationMode';

interface NewConversationModelInput {
  selectedModel: string;
  mode: ConversationExecutionMode;
  subscriptionTier: string;
  installedModelIds: readonly string[];
  readySystemModelIds: readonly string[];
  defaultLocalModelDownloading: boolean;
}

export function resolveNewConversationModel({
  selectedModel,
  mode,
  subscriptionTier,
  installedModelIds,
  readySystemModelIds,
  defaultLocalModelDownloading,
}: NewConversationModelInput): string | undefined {
  if (executionModeForSelection(selectedModel, mode) === mode) return selectedModel;
  if (mode === 'cloud') {
    return getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID;
  }
  return (
    pickReadyLocalModelId(
      DEFAULT_LOCAL_MODEL_ID,
      installedModelIds,
      readySystemModelIds,
      defaultLocalModelDownloading,
    ) ?? DEFAULT_LOCAL_MODEL_ID
  );
}
