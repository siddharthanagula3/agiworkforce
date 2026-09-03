export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://agiworkforce.com';

export const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL ?? 'https://api.agiworkforce.com';

export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://signaling.agiworkforce.com';

export const TIMEOUTS = {
  DEFAULT: 30_000,
  SIGN_OUT_CLEANUP: 5_000,
  STREAMING: 120_000,
  STREAM_STALL: 45_000,
  UPLOAD: 60_000,
} as const;

export const MAX_INPUT_LINES = 6;

export const TIME_GROUPS = {
  YESTERDAY: 24 * 60 * 60 * 1000,
  THIS_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;
