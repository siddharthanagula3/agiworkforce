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

function canonicalProvider(value: string | null | undefined): string {
  const squashed = (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROVIDER_SYNONYMS[squashed] ?? squashed;
}

function hasProvider(list: readonly string[], value: string): boolean {
  if (!value) return false;
  return list.some((entry) => canonicalProvider(entry) === value);
}

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
