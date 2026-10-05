import {
  FREE_QUOTA_CATALOGUE_PATH,
  type FreeQuotaCatalogue,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';
import { limitedFreeMedia, orderedReadyFreeMedia } from '@/features/models/lib/free-media-offer';

const LOOKUP_TIMEOUT_MS = 4_000;
const NOT_OFFERED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

export type LimitedFreeMediaLookup =
  { status: 'offered'; modelId: string } | { status: 'not_offered' } | { status: 'unknown' };

const NOT_OFFERED: LimitedFreeMediaLookup = { status: 'not_offered' };
const UNKNOWN: LimitedFreeMediaLookup = { status: 'unknown' };

export function chooseLimitedFreeMedia(
  catalogue: FreeQuotaCatalogue | null,
  category: FreeQuotaMediaCategory,
): string | null {
  if (!catalogue || !limitedFreeMedia(catalogue, category)) return null;
  return orderedReadyFreeMedia(catalogue, category)[0]?.key ?? null;
}

export async function resolveLimitedFreeMedia(
  category: FreeQuotaMediaCategory,
): Promise<LimitedFreeMediaLookup> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(FREE_QUOTA_CATALOGUE_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (NOT_OFFERED_STATUSES.has(response.status)) return NOT_OFFERED;
    if (!response.ok) return UNKNOWN;
    const modelId = chooseLimitedFreeMedia(
      (await response.json()) as FreeQuotaCatalogue | null,
      category,
    );
    return modelId ? { status: 'offered', modelId } : NOT_OFFERED;
  } catch {
    return UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}
