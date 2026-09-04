export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://agiworkforce.com';

/**
 * Express api-gateway base URL.
 *
 * STB-8 fix: some routes live ONLY on the gateway (`services/api-gateway`), not
 * on the Next.js app, and no rewrite bridges them, `next.config.ts` and
 * `vercel.json` only rewrite `/v1/*` for the api host. Calling a gateway-only
 * route against {@link API_URL} therefore 404s. Point those call sites here.
 *
 * Both hosts are ours, so `egressGuard` blocks them identically in Local mode.
 */
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
