import { getModelMetadataById } from '@agiworkforce/types';
import { isFreeQuotaTurnModelId } from '@/src/features/model-picker/service';
import { resolveMobileCloudDispatch } from './cloudDispatchRouting';

export interface UnreadableImagesNoticeInput {
  selectedModelId: string;
  selectedModelName: string;
  executionMode: 'local' | 'cloud';
  subscriptionTier?: string | null;
  message: string;
  attachments: ReadonlyArray<{ mimeType: string }>;
}

export function unreadableImagesNotice(input: UnreadableImagesNoticeInput): string {
  const refusal = `${input.selectedModelName} cannot read images. Choose a model that can, or remove the images before sending.`;
  if (input.executionMode !== 'cloud' || isFreeQuotaTurnModelId(input.selectedModelId)) {
    return refusal;
  }
  const route = resolveMobileCloudDispatch({
    selection: input.selectedModelId,
    message: input.message,
    subscriptionTier: input.subscriptionTier,
    attachments: input.attachments.map((attachment) => ({
      mime: attachment.mimeType,
      type: attachment.mimeType.startsWith('image/') ? 'image' : 'document',
    })),
    currentModelKey: input.selectedModelId,
  });
  if (route.status !== 'selected' || route.dispatch !== 'chat') return refusal;
  if (route.modelKey === input.selectedModelId) return refusal;
  const answering = getModelMetadataById(route.modelKey)?.name;
  if (!answering) return refusal;
  return `${input.selectedModelName} cannot read images, so ${answering} will answer this message.`;
}
