import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';
import type { ChatMessage } from '@/types/chat';

export function modelEditsImages(modelId: string | undefined): boolean {
  if (!modelId) return false;
  return supportsManagedMediaImageEdit(getModelMetadataById(modelId)?.imageApi);
}

export function serverEditsImages(
  modelId: string | undefined,
  editingModelIds: ReadonlySet<string>,
): boolean {
  return modelEditsImages(modelId) && modelId !== undefined && editingModelIds.has(modelId);
}

export function hasEditableImage(
  messages: readonly ChatMessage[],
  editingModelIds?: ReadonlySet<string>,
): boolean {
  return messages.some(
    (message) =>
      message.type === 'image' &&
      Boolean(message.imageUrl) &&
      (editingModelIds
        ? serverEditsImages(message.model, editingModelIds)
        : modelEditsImages(message.model)),
  );
}
