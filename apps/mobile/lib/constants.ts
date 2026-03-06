/**
 * App-wide constants.
 * API URLs read from Expo env vars at build time.
 */

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://agiworkforce.com';

export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://signaling.agiworkforce.com';

/** Set to true when required Supabase env vars are missing */
export let supabaseConfigMissing = false;

export const SUPABASE_URL = (() => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error(
      '[constants] EXPO_PUBLIC_SUPABASE_URL is not set — Supabase auth/data will not work. ' +
        'Set EXPO_PUBLIC_SUPABASE_URL in your .env file.',
    );
    supabaseConfigMissing = true;
  }
  return url ?? '';
})();

export const SUPABASE_ANON_KEY = (() => {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    console.error(
      '[constants] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set — Supabase auth/data will not work. ' +
        'Set EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
    );
    supabaseConfigMissing = true;
  }
  return key ?? '';
})();

/** Request timeouts */
export const TIMEOUTS = {
  DEFAULT: 30_000,
  STREAMING: 120_000,
  UPLOAD: 60_000,
} as const;

/** Maximum lines in multiline chat input */
export const MAX_INPUT_LINES = 6;

/** Conversation grouping thresholds (ms) */
export const TIME_GROUPS = {
  TODAY: 0,
  YESTERDAY: 86_400_000,
  THIS_WEEK: 604_800_000,
} as const;
