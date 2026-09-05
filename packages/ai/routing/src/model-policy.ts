/**
 * Which models a workspace may run.
 *
 * Pure and total: no I/O, no throw, every input yields a decision. It is the
 * single evaluator for model access, so the answer is identical whether the
 * request came from chat, a scheduled task, an agent run, the CLI, or a raw API
 * call, and identical whether it is asked before routing (as an admission input
 * to `resolveAutoRoute`) or after.
 *
 * @module routing/model-policy
 * @packageDocumentation
 */
import type { Provider } from '@agiworkforce/types';

export interface ModelAccessPolicy {
  allowedProviders: Provider[];
  blockedProviders: Provider[];
  allowedModels: string[];
  blockedModels: string[];
}

export interface ModelAccessAsk {
  /**
   * The VENDOR that owns the model, the catalog's `provider` field, which is
   * the identity a policy row is written about. `"minimax"` for a MiniMax
   * model, whatever wire carries it.
   */
  provider: string | null;
  modelId: string | null;
  /**
   * The TRANSPORT actually carrying the request, when it differs from the
   * vendor: the aggregator the dispatch layer resolved to. A MiniMax model
   * dispatched through OpenRouter asks with `provider: 'minimax'` and
   * `transportProvider: 'openrouter'`.
   *
   * Optional, and omitting it means "vendor and transport are the same thing",
   * which is true of every direct-dispatch route.
   */
  transportProvider?: string | null;
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
 * Provider identifiers reach this evaluator in two different spellings, and a
 * policy that fails to match is a policy that silently permits.
 *
 * A saved policy row holds the CATALOG spelling, the `Provider` union in
 * packages/contracts/types/src/provider.ts, which the workspace console writes
 *, so an administrator blocking OpenRouter stores `"open_router"`. The ask,
 * however, arrives from the dispatch layer, and `resolveProviderFromModel`
 * (lib/services/provider-adapter-service.ts) returns the ADAPTER spelling
 * `"openrouter"`, because that is the key of its server provider config. Plain
 * lowercase equality between those two strings is false, so a provider BLOCK
 * matched nothing at all. An allowlist still denied correctly, the ask simply
 * failed to appear on the approved list, which is exactly why the hole was
 * invisible: the deny direction looked healthy while the block direction was
 * inert.
 *
 * Two stages, so the general case is covered rather than the one pair:
 *
 *   1. SEPARATOR SQUASH. Case, whitespace, hyphens and underscores carry no
 *      meaning in a provider id, so they are removed before comparing. That
 *      alone unifies every separator variant in the tree at once.
 *      open_router/open-router/openrouter, managed_cloud/managed-cloud/
 *      managedcloud, nvidia_nim/nvidia-nim, ollama_cloud/ollama-cloud,
 *      lmstudio/lm-studio/lm_studio, x_ai/x-ai/xai, zhipu_ai/zhipuai, without
 *      needing an entry per spelling. No two distinct providers in the catalog
 *      union collide once squashed, which is what makes this safe.
 *   2. SYNONYMS. Genuinely different words for the same provider, which no
 *      amount of punctuation stripping can join.
 *
 * Both the ask and every stored list entry go through this, so the comparison
 * is symmetric: it does not matter which side was written in which dialect.
 * MODEL ids are deliberately NOT squashed, separators are load-bearing in a
 * model id, and folding them would let one model's rule capture another's.
 */
const PROVIDER_SYNONYMS: Readonly<Record<string, string>> = {
  // xAI: the vendor, the brand, and the model family are used interchangeably.
  grok: 'xai',
  // Zhipu: the company suffixes its name; the catalog does not.
  zhipuai: 'zhipu',
  // Google: `gemini` and `googleai` appear as provider-shaped ids on the client.
  gemini: 'google',
  googleai: 'google',
  // Anthropic / OpenAI: the consumer-facing product names, which the
  // `AIProvider` union in shared/types/common.ts still admits.
  claude: 'anthropic',
  chatgpt: 'openai',
  // NVIDIA: the catalog spells the NIM surface out, the client says `nvidia`.
  nvidia: 'nvidianim',
  // Bedrock: the catalog uses the bare service name, callers often qualify it.
  awsbedrock: 'bedrock',
  amazonbedrock: 'bedrock',
};

export function canonicalProvider(value: string | null | undefined): string {
  const squashed = (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROVIDER_SYNONYMS[squashed] ?? squashed;
}

function hasProvider(list: readonly string[], value: string): boolean {
  if (!value) return false;
  return list.some((entry) => canonicalProvider(entry) === value);
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
 * TWO PROVIDER IDENTITIES, ASYMMETRICALLY HONOURED. A model has a VENDOR (who
 * built it) and a TRANSPORT (who carries the bytes), and when an aggregator is
 * in the path those are different strings for the same request. An
 * administrator can mean either one:
 *
 *   "do not use MiniMax models"       -> the VENDOR
 *   "do not route through OpenRouter" -> the TRANSPORT
 *
 * The rule, plainly:
 *
 *   A BLOCK matches EITHER identity. Naming MiniMax stops MiniMax models even
 *   when an aggregator carries them; naming OpenRouter stops everything the
 *   aggregator carries. A blocklist is a statement about what must not happen,
 *   and an administrator who names one identity has not consented to the other
 *   smuggling it back in.
 *
 *   An ALLOWLIST is satisfied by the VENDOR alone. An aggregator the
 *   administrator never thought about must not DEFEAT an allow, approving
 *   MiniMax has to keep working after someone sets `OPENROUTER_API_KEY`, and,
 *   symmetrically, must not SATISFY one: `allowedProviders: ['open_router']`
 *   approves genuine OpenRouter catalog models, not every vendor whose traffic
 *   happens to be routed that way. The allow direction resolves ambiguity by
 *   denying, which is the safe direction for an allowlist.
 *
 * A caller that supplies only `provider` gets the old behaviour exactly, which
 * is correct for every direct-dispatch route.
 *
 * AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL. A row that arrives empty
 *, a fresh insert, a failed migration, a UI that saved before the user chose
 * anything, must not silently lock every member out of every model. Denial is
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
  const vendor = canonicalProvider(ask.provider);
  const transport = canonicalProvider(ask.transportProvider);

  if (has(policy.blockedModels, model)) {
    return {
      allowed: false,
      code: 'model_blocked',
      reason: `Your workspace administrator has blocked the model "${ask.modelId}". Choose another model.`,
    };
  }

  if (has(policy.allowedModels, model)) return ALLOWED;

  // Either identity denies, and the message names the one the administrator
  // actually wrote down, telling someone their MiniMax model was refused
  // because of "minimax" when the rule said "open_router" is unactionable.
  const blockedLabel = hasProvider(policy.blockedProviders, vendor)
    ? ask.provider
    : transport !== vendor && hasProvider(policy.blockedProviders, transport)
      ? ask.transportProvider
      : null;
  if (blockedLabel !== null && blockedLabel !== undefined) {
    return {
      allowed: false,
      code: 'provider_blocked',
      reason: `Your workspace administrator has blocked the provider "${blockedLabel}". Choose a model from an approved provider.`,
    };
  }

  if (policy.allowedModels.length > 0) {
    return {
      allowed: false,
      code: 'model_not_allowed',
      reason: `Your workspace administrator restricts which models may be used, and "${ask.modelId}" is not on the approved list.`,
    };
  }

  // Vendor only. See the identity rule above: a transport neither satisfies an
  // allowlist nor defeats one.
  if (policy.allowedProviders.length > 0 && !hasProvider(policy.allowedProviders, vendor)) {
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
