import {
  FALLBACK_REASON_HEADER,
  RESOLVED_MODEL_HEADER,
  describeFallbackReason,
  getModelMetadataById,
} from '@agiworkforce/types';
import { getFreeQuotaChatOffering } from '@/src/features/model-picker/freeQuotaCatalogue';

export interface ModelSubstitution {
  fallbackReason: string;
  servedModel?: string;
}

export function readModelSubstitution(headers: Pick<Headers, 'get'>): ModelSubstitution | null {
  const fallbackReason = headers.get(FALLBACK_REASON_HEADER)?.trim();
  if (!fallbackReason) return null;
  const servedModel = headers.get(RESOLVED_MODEL_HEADER)?.trim();
  return servedModel ? { fallbackReason, servedModel } : { fallbackReason };
}

function servedModelLabel(modelId: unknown): string | null {
  if (typeof modelId !== 'string' || !modelId) return null;
  return (
    getFreeQuotaChatOffering(modelId)?.displayName ?? getModelMetadataById(modelId)?.name ?? null
  );
}

export function messageFallbackNotice(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const reason = metadata?.['fallbackReason'];
  if (typeof reason !== 'string') return null;
  return describeFallbackReason(reason, servedModelLabel(metadata?.['servedModel']));
}
