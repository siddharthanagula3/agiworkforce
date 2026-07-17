/**
 * Model-switch cache-penalty assessment (canonical, cross-surface).
 *
 * Prompt caches are keyed on (account + MODEL + exact token prefix). Switching the model
 * mid-conversation is therefore a guaranteed cache MISS: the new model has no cached prefix,
 * so the entire conversation-so-far is re-processed at FULL input price (no cached discount),
 * and on Anthropic the text may also re-tokenize (Opus 4.7+ uses a different tokenizer). See
 * `docs/current/claude-parity-artifacts-memory-caching-reference.md` §5 (what breaks a cache)
 * and §6.3 (surface the model-switch penalty to users).
 *
 * This module is the ONE place that decides whether to warn, so web / desktop / mobile all
 * present the same behavior. It is pure (no I/O, no platform deps) and fully testable; the
 * surfaces own the actual dialog/banner UI.
 */

export interface ModelSwitchCacheInput {
  /** The model that produced the conversation's existing turns (the cached prefix's model). */
  priorModelId: string | null | undefined;
  /** The model the user is switching TO. */
  nextModelId: string;
  /** Number of assistant turns already in the conversation (the cached context). */
  priorTurnCount: number;
  /** Optional human labels for a nicer message; default to the ids. */
  priorModelLabel?: string;
  nextModelLabel?: string;
}

export interface ModelSwitchCacheAssessment {
  /** True when the switch will reset the prompt cache (different model + existing context). */
  resetsCache: boolean;
  /** True when we should warn the user (there is cached context worth losing). */
  warn: boolean;
  /** Machine reason for the decision. */
  reason: 'no-prior-model' | 'no-prior-turns' | 'same-model' | 'cache-reset';
  /** User-facing one-line warning (empty unless `warn`). */
  message: string;
}

const NO_WARN = (reason: ModelSwitchCacheAssessment['reason']): ModelSwitchCacheAssessment => ({
  resetsCache: false,
  warn: false,
  reason,
  message: '',
});

/**
 * Decide whether switching to `nextModelId` mid-conversation should warn the user that the
 * prompt cache will reset (and prior context will be re-billed at full input price).
 *
 * Warn ONLY when there is genuinely a warm cache to lose: a different model AND at least one
 * prior assistant turn. A brand-new conversation (no prior turns) or a no-op re-selection of
 * the same model never warns — switching freely before the first response is free.
 */
export function assessModelSwitchCache(input: ModelSwitchCacheInput): ModelSwitchCacheAssessment {
  const { priorModelId, nextModelId, priorTurnCount } = input;

  // Nothing cached yet (new conversation / first turn) → switching is free.
  if (priorTurnCount <= 0) return NO_WARN('no-prior-turns');
  // No known prior model → cannot claim a cache existed.
  if (!priorModelId) return NO_WARN('no-prior-model');
  // Same model → the cached prefix still applies, no reset.
  if (priorModelId === nextModelId) return NO_WARN('same-model');

  const from = input.priorModelLabel || priorModelId;
  const to = input.nextModelLabel || nextModelId;
  return {
    resetsCache: true,
    warn: true,
    reason: 'cache-reset',
    message:
      `Switching from ${from} to ${to} starts a new prompt cache. ` +
      `Your conversation so far will be re-processed at full input price ` +
      `(no cached discount) until the new cache builds. Keeping the same model reuses the cache.`,
  };
}
