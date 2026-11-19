import { getModelMetadataById } from '@agiworkforce/types';
import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { listMediaModels, resolveMediaModelId } from '@/src/features/chat/actions/mediaMode';
import { useChatViewStore } from '@/stores/chat/chatViewStore';

export const IMAGE_REFERENCES_UNAVAILABLE = 'Photos can’t be used with image creation right now.';

export type ImageReferenceModel =
  | { status: 'unavailable' }
  | { status: 'ready'; modelId: string; switched: false }
  | { status: 'ready'; modelId: string; switched: true; name: string };

function acceptsReferences(modelId: string): boolean {
  return supportsManagedMediaImageEdit(getModelMetadataById(modelId)?.provider);
}

export function resolveImageReferenceModel(
  selections: { image?: string; video?: string } = useChatViewStore.getState().selectedMediaModel,
): ImageReferenceModel {
  const current = resolveMediaModelId('image', selections);
  if (current && acceptsReferences(current)) {
    return { status: 'ready', modelId: current, switched: false };
  }
  const editing = listMediaModels('image').find(acceptsReferences);
  if (!editing) return { status: 'unavailable' };
  return {
    status: 'ready',
    modelId: editing,
    switched: true,
    name: getModelMetadataById(editing)?.name ?? editing,
  };
}

export function withImageReferenceModel<T>(modelId: string, run: () => T): T {
  const previous = useChatViewStore.getState().selectedMediaModel;
  useChatViewStore.setState({ selectedMediaModel: { ...previous, image: modelId } });
  try {
    return run();
  } finally {
    useChatViewStore.setState({ selectedMediaModel: previous });
  }
}
