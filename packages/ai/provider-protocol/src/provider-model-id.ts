import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';

/**
 * Resolve a product/catalog model ID to the exact model string sent to the
 * upstream provider API.
 *
 * Unknown IDs pass through unchanged so this pure boundary never invents a
 * provider identifier. Admission policy remains the caller's responsibility.
 */
export function toProviderApiModelId(modelId: string): string {
  const canonicalModelId = normalizeModelId(modelId);
  const metadata = getModelMetadataById(canonicalModelId);
  return metadata?.apiModelId ?? canonicalModelId ?? modelId;
}
