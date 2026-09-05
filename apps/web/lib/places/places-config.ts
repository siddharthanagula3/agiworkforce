import 'server-only';

import { logger } from '@/lib/logger';

export const PLACES_API_KEY_ENV = 'GOOGLE_PLACES_API_KEY';
export const PLACES_UNIT_PRICE_ENV = 'AGI_PLACES_SEARCH_MICROUSD_PER_CALL';

export const PLACES_SEARCH_TIMEOUT_MS = 8_000;

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;
const REQUESTS_PER_PRICED_BLOCK = 1_000;

/**
 * Google's published Text Search Enterprise rate, USD per 1,000 requests, at
 * the first paid volume tier. Source:
 * https://developers.google.com/maps/billing-and-pricing/pricing, fetched
 * 2026-09-05 ($35.00 per 1,000, SKU E967-44BC-B44D). The Enterprise SKU is the
 * one this adapter buys because its field mask asks for rating, review count,
 * price level and opening hours.
 */
const GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK = 35.0;

export function placesApiKey(): string | undefined {
  const raw = process.env[PLACES_API_KEY_ENV];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function configuredUnitPriceMicrousd(): number | null {
  const raw = process.env[PLACES_UNIT_PRICE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    logger.error(
      { env: PLACES_UNIT_PRICE_ENV, value: raw },
      '[places] invalid unit price override; falling back to the published rate',
    );
    return null;
  }
  return parsed;
}

export function placesSearchMicrousdPerCall(): number {
  return (
    configuredUnitPriceMicrousd() ??
    Math.round(
      (GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK / REQUESTS_PER_PRICED_BLOCK) * USD_TO_MICROUSD,
    )
  );
}

export function placesSearchCostCents(calls: number): number {
  if (!Number.isFinite(calls) || calls <= 0) return 0;
  return Math.round((calls * placesSearchMicrousdPerCall()) / MICROUSD_PER_CENT);
}
