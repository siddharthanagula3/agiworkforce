/**
 * App-wide constants.
 * API URLs read from Expo env vars at build time.
 */

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://agiworkforce.com';

// CRIT-MOB-02 fix (2026-05-04): EXPO_PUBLIC_* vars are inlined into the JS
// bundle by Metro at build time — the Deepgram key was world-readable in any
// extracted IPA/APK. The key is now held exclusively server-side.
//
// Real-time voice transcription uses an ephemeral Deepgram token issued by the
// backend (/api/v1/voice/token) which is valid for 60 seconds and scoped to a
// single request. The backend never returns the master key to the client.
//
// REMOVED: EXPO_PUBLIC_DEEPGRAM_API_KEY
// Callers that previously passed DEEPGRAM_API_KEY to transcribeWithDeepgram()
// must now call getDeepgramEphemeralToken() first.

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

/**
 * Conversation grouping thresholds in milliseconds.
 * These represent the maximum age (from start-of-today) for each group:
 *   - TODAY:     messages updated today (age < 0 from start-of-today, i.e. after midnight)
 *   - YESTERDAY: updated within the past 24h from start-of-today (age < 86400000)
 *   - THIS_WEEK: updated within the past 7 days (age < 604800000)
 *
 * Comparisons use the age relative to start-of-today:
 *   age = startOfToday - updatedAt (ms)
 *   age < 0          → Today  (updated since midnight)
 *   age < YESTERDAY  → Yesterday
 *   age < THIS_WEEK  → This Week
 *   else             → Older
 */
export const TIME_GROUPS = {
  /** 24 hours — upper bound (exclusive) for the "Yesterday" bucket */
  YESTERDAY: 24 * 60 * 60 * 1000,
  /** 7 days — upper bound (exclusive) for the "This Week" bucket */
  THIS_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;
