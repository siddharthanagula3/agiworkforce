import {
  getModelMetadataById,
  getRetiredModelMetadataById,
  type ModelMetadata,
} from '@agiworkforce/types';

const RETIREMENT_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function upcomingRetirementLabel(
  metadata: Pick<ModelMetadata, 'deprecation_date'> | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!metadata?.deprecation_date) return null;
  const retiresAt = Date.parse(metadata.deprecation_date);
  if (Number.isNaN(retiresAt)) return null;
  const daysUntil = (retiresAt - now) / DAY_MS;
  if (daysUntil <= 0 || daysUntil > RETIREMENT_WARNING_DAYS) return null;
  return `Retires ${formatDay(retiresAt)}`;
}

export function retiredModelNotice(modelId: string | null | undefined): string | null {
  const retired = getRetiredModelMetadataById(modelId);
  if (!retired) return null;
  const replacement = retired.replacedBy
    ? (getModelMetadataById(retired.replacedBy)?.name ?? null)
    : null;
  return replacement
    ? `${retired.name}, which this chat used, has been retired. ${replacement} replaces it.`
    : `${retired.name}, which this chat used, has been retired. Pick another model to keep chatting.`;
}
