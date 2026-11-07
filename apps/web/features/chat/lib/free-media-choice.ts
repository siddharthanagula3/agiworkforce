import {
  FREE_QUOTA_CATALOGUE_PATH,
  chooseLimitedFreeMedia,
  FreeQuotaCatalogueSchema,
  freeMediaAvailability,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';

export { chooseLimitedFreeMedia };

const LOOKUP_TIMEOUT_MS = 4_000;

export type LimitedFreeMediaLookup =
  { status: 'offered'; modelId: string } | { status: 'not_offered' } | { status: 'unknown' };

const NOT_OFFERED: LimitedFreeMediaLookup = { status: 'not_offered' };
const UNKNOWN: LimitedFreeMediaLookup = { status: 'unknown' };

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
    if (!response.ok) return UNKNOWN;
    const catalogue = FreeQuotaCatalogueSchema.parse(await response.json());
    const availability = freeMediaAvailability(catalogue, category);
    if (availability === 'unknown') return UNKNOWN;
    if (availability === 'not_offered') return NOT_OFFERED;
    const modelId = chooseLimitedFreeMedia(catalogue, category);
    return modelId ? { status: 'offered', modelId } : UNKNOWN;
  } catch {
    return UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}
