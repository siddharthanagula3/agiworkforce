import 'server-only';

import { getModelMetadataById } from '@agiworkforce/types';

export const LIVE_VOICE_FEATURE = 'voice_live';
export const LIVE_SESSION_BLOCK_MINUTES = 10;
export const LIVE_SESSION_CENTS_PER_MINUTE = 5;
export const LIVE_SESSION_PROVIDER_COST_SOURCE = 'provider_published_rate';

const SECONDS_PER_MINUTE = 60;
const CENTS_PER_USD = 100;

export function liveSessionCostCents(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.ceil((seconds / SECONDS_PER_MINUTE) * LIVE_SESSION_CENTS_PER_MINUTE));
}

/**
 * What the provider charges for the session itself, at its published
 * per-minute session rate. Separate from what the user is charged: the two
 * rates are equal today and must not be allowed to track each other silently.
 * Null when the model declares no session rate, which leaves the caller to
 * record no provider cost rather than a number it cannot source.
 */
export function liveSessionProviderCostCents(
  seconds: number,
  modelId: string | null | undefined,
): number | null {
  const usdPerMinute = getModelMetadataById(modelId)?.sessionPerMinuteCost;
  if (seconds <= 0 || usdPerMinute === undefined || usdPerMinute <= 0) return null;
  return Math.max(1, Math.ceil((seconds / SECONDS_PER_MINUTE) * usdPerMinute * CENTS_PER_USD));
}

export interface LiveSessionFailure {
  status: number;
  code: string;
  message: string;
}

export function describeLiveSessionFailure(
  status: number,
  upstreamCode: string,
): LiveSessionFailure {
  if (status === 401 || status === 403 || status === 404) {
    return {
      status: 403,
      code: 'live_voice_access_denied',
      message: `The provider refused the live voice model for this project (${upstreamCode}).`,
    };
  }
  if (status === 429) {
    return {
      status: 429,
      code: 'live_voice_busy',
      message: 'The live voice service is busy right now. Try again in a moment.',
    };
  }
  if (status === 400 || status === 422) {
    return {
      status: 400,
      code: 'live_voice_rejected',
      message: `The live voice session request was rejected (${upstreamCode}).`,
    };
  }
  return {
    status: 503,
    code: 'live_voice_unavailable',
    message: 'The live voice service is unavailable. Try again shortly.',
  };
}
