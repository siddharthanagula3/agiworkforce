import 'server-only';

import {
  MICROUSD_PER_USD,
  chargeMicrousdForProviderCost,
  getModelMetadataById,
} from '@agiworkforce/types';

export const LIVE_VOICE_FEATURE = 'voice_live';
export const LIVE_SESSION_BLOCK_MINUTES = 10;
export const LIVE_SESSION_PROVIDER_COST_SOURCE = 'provider_published_rate';

const SECONDS_PER_MINUTE = 60;

export const LIVE_SESSION_CEILING_SECONDS = LIVE_SESSION_BLOCK_MINUTES * SECONDS_PER_MINUTE;

export function liveSessionProviderCostMicrousd(
  seconds: number,
  modelId: string | null | undefined,
): number | null {
  const usdPerMinute = getModelMetadataById(modelId)?.sessionPerMinuteCost;
  if (usdPerMinute === undefined || !(usdPerMinute > 0)) return null;
  if (!(seconds > 0)) return 0;
  return Math.ceil((seconds / SECONDS_PER_MINUTE) * usdPerMinute * MICROUSD_PER_USD);
}

export function liveSessionChargeMicrousd(
  seconds: number,
  modelId: string | null | undefined,
): number | null {
  const providerMicrousd = liveSessionProviderCostMicrousd(seconds, modelId);
  return providerMicrousd === null ? null : chargeMicrousdForProviderCost(providerMicrousd);
}

export interface LiveSessionFailure {
  status: number;
  code: string;
  message: string;
}

const PROVIDER_ACCOUNT_EXHAUSTED_CODES = new Set([
  'credit_balance_exhausted',
  'insufficient_quota',
]);

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
  if (status === 429 && PROVIDER_ACCOUNT_EXHAUSTED_CODES.has(upstreamCode)) {
    return {
      status: 503,
      code: 'live_voice_unavailable',
      message: 'Live voice is unavailable right now.',
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
