import 'server-only';

import { resolveFeatureRate } from '@agiworkforce/types';

import { logger } from '@/lib/logger';

export const PLACES_API_KEY_ENV = 'GOOGLE_PLACES_API_KEY';
export const PLACES_SEARCH_FEATURE = 'places_text_search';

export const PLACES_SEARCH_TIMEOUT_MS = 8_000;

export function placesApiKey(): string | undefined {
  const raw = process.env[PLACES_API_KEY_ENV];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

export function placesSearchMicrousdPerCall(): number {
  const rate = resolveFeatureRate(PLACES_SEARCH_FEATURE);
  if (rate.overrideInvalid) {
    logger.error(
      { env: rate.overrideEnv },
      '[places] invalid unit price override; falling back to the published rate',
    );
  }
  return rate.providerCogsMicrousd ?? 0;
}
