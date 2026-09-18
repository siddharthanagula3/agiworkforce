import 'server-only';

import { getModelMetadataById } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { hasServerProviderKey, toApiModelId } from '@/lib/services/provider-adapter-service';

export interface OutputClassifierModel {
  providerId: string;
  catalogModelId: string;
  apiModelId: string;
}

const CONFIG_ENV = 'MEDIA_OUTPUT_MODERATION_MODEL';

let cache: { source: string; model: OutputClassifierModel | null } | null = null;

// The classifier is whatever the deployment names in the catalogue, so the
// output check never encodes one vendor's model id.
export function resolveOutputClassifierModel(): OutputClassifierModel | null {
  const source = process.env[CONFIG_ENV]?.trim() ?? '';
  if (cache?.source === source) return cache.model;

  const model = resolveUncached(source);
  cache = { source, model };
  return model;
}

function resolveUncached(source: string): OutputClassifierModel | null {
  if (!source) return null;

  const metadata = getModelMetadataById(source);
  if (!metadata) {
    logger.error(
      { envKey: CONFIG_ENV },
      '[moderation] output classifier model is not in the catalogue',
    );
    return null;
  }
  if (!metadata.inputModalities?.includes('image')) {
    logger.error(
      { envKey: CONFIG_ENV, modelId: metadata.id },
      '[moderation] output classifier model cannot read images',
    );
    return null;
  }
  const providerId = String(metadata.provider);
  if (!hasServerProviderKey(providerId)) {
    logger.error(
      { envKey: CONFIG_ENV, modelId: metadata.id, providerId },
      '[moderation] output classifier provider is not configured',
    );
    return null;
  }

  return { providerId, catalogModelId: metadata.id, apiModelId: toApiModelId(metadata.id) };
}

export function resetOutputClassifierModelCache(): void {
  cache = null;
}
