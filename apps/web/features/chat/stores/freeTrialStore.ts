'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PaywallSlot } from '../types/message-metadata';
export { FREE_TRIAL_MAX_INPUT_CHARS, FREE_TRIAL_PROMPT_LIMIT } from '@/lib/free-trial-config';
import { FREE_TRIAL_PROMPT_LIMIT } from '@/lib/free-trial-config';

const TRIAL_USED_HEADER = 'x-agi-trial-prompts-used';
const TRIAL_LIMIT_HEADER = 'x-agi-trial-prompts-limit';

// The store previously reset `promptsUsed` to `null` on every fresh mount
// (new tab, hard refresh, or returning later the same day) even when the
// server already knew the trial was exhausted for this user — the composer
// would show "3 prompts left" right up until the first send failed with
// `website_trial_prompt_limit_reached`. There is no authenticated GET
// endpoint that returns the server's authoritative per-user prompt count
// (only the completions route echoes it back via response headers after a
// request), so a full server-hydration round trip isn't wired up yet.
// Persisting the last-known usage locally closes the common gap (reload
// after exhausting the trial) without waiting on a new API route: the
// count is a non-sensitive display hint only — the server still enforces
// the real limit on every completion request via `reserveFreeTrialPrompt`
// and `applyHeaders` immediately reconciles the store with the server's
// answer on the very next request regardless of what was cached here.
// Bounded with a short TTL so a shared browser cycling between accounts
// (or a trial period rollover) can't pin a stale count for long.
const TRIAL_USAGE_STORAGE_KEY = 'agi-free-trial-usage';
const TRIAL_USAGE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type FreeTrialErrorCode =
  | 'website_trial_prompt_limit_reached'
  | 'free_trial_model_only'
  | 'free_trial_feature_unavailable'
  | 'free_trial_prompt_too_large';

interface FreeTrialState {
  promptsUsed: number | null;
  promptLimit: number;
  /** Timestamp (ms) the usage was last confirmed — drives the persisted-cache TTL. */
  savedAt: number | null;
  setUsage: (used: number, limit?: number) => void;
  applyHeaders: (headers: Headers) => void;
  markExhausted: () => void;
  resetUsage: () => void;
}

/** Narrow persisted shape written to storage — see `partialize` below. */
type PersistedFreeTrialState = Pick<FreeTrialState, 'promptsUsed' | 'promptLimit' | 'savedAt'>;

function parseHeaderInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function readFreeTrialUsageHeaders(
  headers: Headers,
): { promptsUsed: number; promptLimit: number } | null {
  const promptsUsed = parseHeaderInt(headers.get(TRIAL_USED_HEADER));
  const promptLimit = parseHeaderInt(headers.get(TRIAL_LIMIT_HEADER));
  if (promptsUsed === null || promptLimit === null) return null;
  return { promptsUsed, promptLimit };
}

export function getFreeTrialRemaining(promptsUsed: number | null, promptLimit: number): number {
  return Math.max(0, promptLimit - (promptsUsed ?? 0));
}

export function isFreeTrialErrorCode(code: string | undefined): code is FreeTrialErrorCode {
  return (
    code === 'website_trial_prompt_limit_reached' ||
    code === 'free_trial_model_only' ||
    code === 'free_trial_feature_unavailable' ||
    code === 'free_trial_prompt_too_large'
  );
}

export function buildFreeTrialPaywallSlot(
  code: FreeTrialErrorCode,
  fallbackReason: string,
): PaywallSlot {
  if (code === 'free_trial_feature_unavailable') {
    return {
      feature: 'web_search',
      requiredTier: 'hobby',
      reason:
        fallbackReason ||
        'The website free trial is text-only Auto Economy. Upgrade for search, tools, files, and thinking.',
    };
  }

  return {
    feature: 'token_cap',
    requiredTier: 'hobby',
    reason:
      fallbackReason ||
      'This account has used its three website Auto Economy prompts. Upgrade to unlock more hosted usage.',
  };
}

export const useFreeTrialStore = create<FreeTrialState>()(
  persist(
    (set, get) => ({
      promptsUsed: null,
      promptLimit: FREE_TRIAL_PROMPT_LIMIT,
      savedAt: null,

      setUsage: (used, limit) => {
        const promptLimit = limit ?? get().promptLimit;
        set({
          promptsUsed: Math.min(Math.max(0, used), promptLimit),
          promptLimit,
          savedAt: Date.now(),
        });
      },

      applyHeaders: (headers) => {
        const usage = readFreeTrialUsageHeaders(headers);
        if (!usage) return;
        get().setUsage(usage.promptsUsed, usage.promptLimit);
      },

      markExhausted: () => {
        const promptLimit = get().promptLimit;
        set({ promptsUsed: promptLimit, promptLimit, savedAt: Date.now() });
      },

      resetUsage: () =>
        set({ promptsUsed: null, promptLimit: FREE_TRIAL_PROMPT_LIMIT, savedAt: null }),
    }),
    {
      name: TRIAL_USAGE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the raw usage numbers + timestamp are persisted — actions are
      // recreated fresh by `create()` on every load.
      partialize: (state): PersistedFreeTrialState => ({
        promptsUsed: state.promptsUsed,
        promptLimit: state.promptLimit,
        savedAt: state.savedAt,
      }),
      // Discard stale entries past the TTL (trial period rollover, or a
      // shared browser that last recorded a different account's usage)
      // instead of hydrating a misleading "still exhausted" / "still full"
      // count into a fresh session.
      merge: (persisted, current) => {
        const candidate = persisted as Partial<PersistedFreeTrialState> | null | undefined;
        if (
          !candidate ||
          typeof candidate.savedAt !== 'number' ||
          Date.now() - candidate.savedAt > TRIAL_USAGE_TTL_MS ||
          typeof candidate.promptsUsed !== 'number' ||
          typeof candidate.promptLimit !== 'number'
        ) {
          return current;
        }
        return {
          ...current,
          promptsUsed: candidate.promptsUsed,
          promptLimit: candidate.promptLimit,
          savedAt: candidate.savedAt,
        };
      },
    },
  ),
);
