import 'server-only';

import {
  MICROUSD_PER_USD,
  chargeMicrousdForProviderCost,
  getModelMetadataById,
} from '@agiworkforce/types';

export const LIVE_VOICE_FEATURE = 'voice_live';
export const LIVE_SESSION_PROVIDER_COST_SOURCE = 'provider_published_rate';

const SECONDS_PER_MINUTE = 60;
const TOKENS_PER_MILLION = 1_000_000;

/**
 * Voice draws on the same usage budget as chat, one minute at a time: each
 * block is reserved just before it is needed and the session settles at what
 * it actually used, so a start never holds more of the budget than a minute.
 */
export const LIVE_VOICE_BLOCK_SECONDS = SECONDS_PER_MINUTE;

/**
 * How long a session with no check-in still counts as running. Past it the
 * session is closed where its tab last renewed it and its reservation settled.
 */
export const LIVE_VOICE_LEASE_SECONDS = 10 * SECONDS_PER_MINUTE;

/**
 * What a minute of conversation is expected to spend on the delegated backend
 * before the real figure is known: the instructions and recent transcript the
 * backend is sent, and a spoken-length answer. It only sizes the reservation;
 * the session settles at the usage it reports.
 */
const BACKEND_INPUT_TOKENS_PER_MINUTE = 6_000;
const BACKEND_OUTPUT_TOKENS_PER_MINUTE = 300;

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

export function liveVoiceBackendAllowanceMicrousd(
  seconds: number,
  backendModelId: string | null | undefined,
): number {
  const model = getModelMetadataById(backendModelId);
  if (!model || !(seconds > 0)) return 0;
  const minutes = seconds / SECONDS_PER_MINUTE;
  const usd =
    (minutes * BACKEND_INPUT_TOKENS_PER_MINUTE * model.inputCost +
      minutes * BACKEND_OUTPUT_TOKENS_PER_MINUTE * model.outputCost) /
    TOKENS_PER_MILLION;
  return Math.ceil(usd * MICROUSD_PER_USD);
}

/**
 * The charge reserved for one block: the live model's published per-minute
 * rate and the backend allowance, priced as every other managed charge is.
 * Null when the live model declares no session rate and cannot be charged.
 */
export function liveVoiceBlockChargeMicrousd(
  liveModelId: string | null | undefined,
  backendModelId: string | null | undefined,
): number | null {
  const session = liveSessionProviderCostMicrousd(LIVE_VOICE_BLOCK_SECONDS, liveModelId);
  if (session === null) return null;
  return chargeMicrousdForProviderCost(
    session + liveVoiceBackendAllowanceMicrousd(LIVE_VOICE_BLOCK_SECONDS, backendModelId),
  );
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
