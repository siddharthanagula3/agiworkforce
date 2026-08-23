import type { Provider } from '@agiworkforce/types';

export interface ModelAccessPolicy {
  allowedProviders: Provider[];
  blockedProviders: Provider[];
  allowedModels: string[];
  blockedModels: string[];
}

export interface ModelAccessAsk {
  provider: string | null;
  modelId: string | null;
}

export type ModelAccessCode =
  | 'allowed'
  | 'ungoverned'
  | 'model_blocked'
  | 'provider_blocked'
  | 'model_not_allowed'
  | 'provider_not_allowed';

export interface ModelAccessDecision {
  allowed: boolean;
  code: ModelAccessCode;
  reason: string;
}

const ALLOWED: ModelAccessDecision = {
  allowed: true,
  code: 'allowed',
  reason: 'Permitted by workspace model policy.',
};

const UNGOVERNED: ModelAccessDecision = {
  allowed: true,
  code: 'ungoverned',
  reason: 'No workspace model policy applies to this request.',
};

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function has(list: readonly string[], value: string): boolean {
  if (!value) return false;
  return list.some((entry) => normalize(entry) === value);
}

/**
 * Decides whether one workspace may run one model.
 *
 * PRECEDENCE, which is the whole contract of this file:
 *
 *   1. An explicit model block wins over everything. An administrator who names
 *      a model has said something more specific than any provider rule, and a
 *      deny is the direction that must never be overridden by accident.
 *   2. An explicit model allow beats a provider block, for the same reason in
 *      the other direction: "no Provider X except this one model" is a real
 *      policy an enterprise writes, and it cannot be expressed if the provider
 *      block swallows it.
 *   3. Provider blocks.
 *   4. Allowlists, model then provider.
 *
 * AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL. A row that arrives empty
 * — a fresh insert, a failed migration, a UI that saved before the user chose
 * anything — must not silently lock every member out of every model. Denial is
 * something an administrator says, never something a blank field implies. The
 * same reasoning governs a missing policy row upstream of this function.
 *
 * This is pure and total: no I/O, no throw, and every input yields a decision.
 * It is the single evaluator for model access, so the answer is identical
 * whether the request came from chat, a scheduled task, an agent run, the CLI,
 * or a raw API call.
 */
export function evaluateModelAccess(
  policy: ModelAccessPolicy | null,
  ask: ModelAccessAsk,
): ModelAccessDecision {
  if (!policy) return UNGOVERNED;

  const model = normalize(ask.modelId);
  const provider = normalize(ask.provider);

  if (has(policy.blockedModels, model)) {
    return {
      allowed: false,
      code: 'model_blocked',
      reason: `Your workspace administrator has blocked the model "${ask.modelId}". Choose another model.`,
    };
  }

  if (has(policy.allowedModels, model)) return ALLOWED;

  if (has(policy.blockedProviders, provider)) {
    return {
      allowed: false,
      code: 'provider_blocked',
      reason: `Your workspace administrator has blocked the provider "${ask.provider}". Choose a model from an approved provider.`,
    };
  }

  if (policy.allowedModels.length > 0) {
    return {
      allowed: false,
      code: 'model_not_allowed',
      reason: `Your workspace administrator restricts which models may be used, and "${ask.modelId}" is not on the approved list.`,
    };
  }

  if (policy.allowedProviders.length > 0 && !has(policy.allowedProviders, provider)) {
    return {
      allowed: false,
      code: 'provider_not_allowed',
      reason: `Your workspace administrator restricts which providers may be used, and "${ask.provider}" is not on the approved list.`,
    };
  }

  return ALLOWED;
}

/**
 * True when the policy would deny at least one thing.
 *
 * A row of four empty arrays is a saved row that governs nothing, and surfaces
 * that report posture must be able to tell that apart from real restriction
 * rather than showing "policy saved" as if it were a control.
 */
export function policyRestrictsAnything(policy: ModelAccessPolicy | null): boolean {
  if (!policy) return false;
  return (
    policy.allowedProviders.length > 0 ||
    policy.blockedProviders.length > 0 ||
    policy.allowedModels.length > 0 ||
    policy.blockedModels.length > 0
  );
}
