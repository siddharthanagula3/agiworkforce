import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';

export function toProviderApiModelId(modelId: string): string {
  const canonicalModelId = normalizeModelId(modelId);
  const metadata = getModelMetadataById(canonicalModelId);
  return metadata?.apiModelId ?? canonicalModelId ?? modelId;
}
