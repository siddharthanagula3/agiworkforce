import { getModelMetadataById } from '@agiworkforce/types';

export function imageSettingsCaption(modelId?: string, aspectRatio?: string): string | null {
  const id = modelId?.trim();
  const label = id ? getModelMetadataById(id)?.name : undefined;
  if (!label) return null;
  return `Generated with ${label}${aspectRatio && aspectRatio !== 'auto' ? ` · ${aspectRatio}` : ''}`;
}
