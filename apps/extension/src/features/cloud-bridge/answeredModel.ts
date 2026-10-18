import { getModelMetadataById } from '@agiworkforce/types';

export const RESOLVED_MODEL_HEADER = 'X-AGI-Resolved-Model';

const MAX_MODEL_ID_CHARS = 200;

export function normalizeAnsweredModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const modelId = value.trim();
  if (!modelId || modelId.length > MAX_MODEL_ID_CHARS) return null;
  return getModelMetadataById(modelId)?.id ?? null;
}

export function readAnsweredModel(headers: Headers): string | null {
  return normalizeAnsweredModel(headers.get(RESOLVED_MODEL_HEADER));
}
