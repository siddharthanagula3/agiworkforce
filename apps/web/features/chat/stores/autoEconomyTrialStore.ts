'use client';

import { create } from 'zustand';
import type { PaywallSlot } from '../types/message-metadata';

export const AUTO_ECONOMY_TRIAL_PROMPT_LIMIT = 3;
export const AUTO_ECONOMY_TRIAL_MAX_INPUT_CHARS = 24_000;

const TRIAL_USED_HEADER = 'x-agi-trial-prompts-used';
const TRIAL_LIMIT_HEADER = 'x-agi-trial-prompts-limit';

export type AutoEconomyTrialErrorCode =
  | 'website_trial_prompt_limit_reached'
  | 'free_trial_auto_economy_only'
  | 'free_trial_feature_unavailable'
  | 'free_trial_prompt_too_large';

interface AutoEconomyTrialState {
  promptsUsed: number | null;
  promptLimit: number;
  setUsage: (used: number, limit?: number) => void;
  applyHeaders: (headers: Headers) => void;
  markExhausted: () => void;
  resetUsage: () => void;
}

function parseHeaderInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function readAutoEconomyTrialUsageHeaders(
  headers: Headers,
): { promptsUsed: number; promptLimit: number } | null {
  const promptsUsed = parseHeaderInt(headers.get(TRIAL_USED_HEADER));
  const promptLimit = parseHeaderInt(headers.get(TRIAL_LIMIT_HEADER));
  if (promptsUsed === null || promptLimit === null) return null;
  return { promptsUsed, promptLimit };
}

export function getAutoEconomyTrialRemaining(
  promptsUsed: number | null,
  promptLimit: number,
): number {
  return Math.max(0, promptLimit - (promptsUsed ?? 0));
}

export function isAutoEconomyTrialErrorCode(
  code: string | undefined,
): code is AutoEconomyTrialErrorCode {
  return (
    code === 'website_trial_prompt_limit_reached' ||
    code === 'free_trial_auto_economy_only' ||
    code === 'free_trial_feature_unavailable' ||
    code === 'free_trial_prompt_too_large'
  );
}

export function buildAutoEconomyTrialPaywallSlot(
  code: AutoEconomyTrialErrorCode,
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

export const useAutoEconomyTrialStore = create<AutoEconomyTrialState>()((set, get) => ({
  promptsUsed: null,
  promptLimit: AUTO_ECONOMY_TRIAL_PROMPT_LIMIT,

  setUsage: (used, limit) => {
    const promptLimit = limit ?? get().promptLimit;
    set({
      promptsUsed: Math.min(Math.max(0, used), promptLimit),
      promptLimit,
    });
  },

  applyHeaders: (headers) => {
    const usage = readAutoEconomyTrialUsageHeaders(headers);
    if (!usage) return;
    get().setUsage(usage.promptsUsed, usage.promptLimit);
  },

  markExhausted: () => {
    const promptLimit = get().promptLimit;
    set({ promptsUsed: promptLimit, promptLimit });
  },

  resetUsage: () => set({ promptsUsed: null, promptLimit: AUTO_ECONOMY_TRIAL_PROMPT_LIMIT }),
}));
