import 'server-only';

export const LIVE_VOICE_FEATURE = 'voice_live';
export const LIVE_SESSION_BLOCK_MINUTES = 10;
export const LIVE_SESSION_CENTS_PER_MINUTE = 5;

export function liveSessionCostCents(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.ceil((seconds / 60) * LIVE_SESSION_CENTS_PER_MINUTE));
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
