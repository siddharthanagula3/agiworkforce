import {
  MICROUSD_PER_CREDIT,
  MICROUSD_PER_USD,
  chargeCreditsForMicrousd,
  creditsFromMicrousd,
} from './credits';

export { MICROUSD_PER_CREDIT, MICROUSD_PER_USD, creditsFromMicrousd };

export const MICROUSD_PER_CENT = 10_000;

export function microusdFromCents(cents: number): number {
  return Math.round(cents * MICROUSD_PER_CENT);
}

export function centsFromMicrousdCeil(microusd: number): number {
  if (!Number.isFinite(microusd) || microusd <= 0) return 0;
  return Math.ceil(microusd / MICROUSD_PER_CENT);
}

export function chargeMicrousdForProviderCost(providerMicrousd: number): number {
  return Math.round(chargeCreditsForMicrousd(providerMicrousd) * MICROUSD_PER_CREDIT);
}

export const RATE_CARD_FEATURES = [
  'web_search_perplexity',
  'web_search_grounding',
  'web_search_anthropic',
  'web_search_openai',
  'places_text_search',
  'image_generation_openai_low',
  'image_generation_openai_medium',
  'image_generation_openai_high',
  'image_generation_google',
  'video_second',
  'voice_live_minute',
  'transcription_minute',
  'sandbox_vcpu_second',
  'sandbox_gib_second',
  'hosted_code_execution_openai_session',
  'hosted_code_execution_anthropic_hour',
  'object_storage_gib_month',
  'database_compute_second',
  'vector_query_request',
  'notification_delivery_request',
  'email_message_request',
  'network_egress_gib',
  'connector_call_request',
  'artifact_storage_gib_month',
] as const;

export type RateCardFeature = (typeof RATE_CARD_FEATURES)[number];

export const RATE_CARD_UNITS = [
  'request',
  'image',
  'second',
  'minute',
  'hour',
  'session',
  'gibibyte',
  'gibibyte_month',
] as const;
export type RateCardUnit = (typeof RATE_CARD_UNITS)[number];

/**
 * `rate_card` means the number on this row is the whole answer.
 * `derived_from_model` means the row carries a reference figure only and the
 * live amount comes from the model catalogue's per-unit pricing for whichever
 * model served the call.
 * `deployment_metered` means this repository publishes no per-unit rate at all:
 * the number is whatever the deployment's infrastructure vendors bill it, read
 * from the row's override env var. A row on this basis prices nothing until
 * that variable is set, which is the honest state for a cost the code cannot
 * know.
 */
export const RATE_CARD_BASES = ['rate_card', 'derived_from_model', 'deployment_metered'] as const;
export type RateCardBasis = (typeof RATE_CARD_BASES)[number];

export const RATE_CARD_INCLUSIONS = ['all_plans', 'interactive_chat', 'no_plan'] as const;
export type RateCardInclusion = (typeof RATE_CARD_INCLUSIONS)[number];

export interface RateCardEntry {
  readonly unit: RateCardUnit;
  readonly providerCogsMicrousd: number | null;
  readonly providerCogsBasis: RateCardBasis;
  readonly includedInPlans: RateCardInclusion;
  readonly source: string;
  readonly verifiedOn: string;
  readonly estimate?: true;
}

const CATALOGUE_SOURCE = 'packages/contracts/types/src/models.json';

const DEPLOYMENT_METERED_SOURCE =
  'deployment-metered: this repository publishes no per-unit rate; the deployment supplies it through the row override env var';

function infrastructureRate(unit: RateCardUnit): RateCardEntry {
  return {
    unit,
    providerCogsMicrousd: null,
    providerCogsBasis: 'deployment_metered',
    includedInPlans: 'no_plan',
    source: DEPLOYMENT_METERED_SOURCE,
    verifiedOn: '2026-09-17',
  };
}

export const FEATURE_RATE_CARD: Readonly<Record<RateCardFeature, RateCardEntry>> = {
  web_search_perplexity: {
    unit: 'request',
    providerCogsMicrousd: 5_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'interactive_chat',
    source: 'https://docs.perplexity.ai/getting-started/pricing',
    verifiedOn: '2026-09-10',
  },
  web_search_grounding: {
    unit: 'request',
    providerCogsMicrousd: 14_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'interactive_chat',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedOn: '2026-09-08',
  },
  web_search_anthropic: {
    unit: 'request',
    providerCogsMicrousd: 10_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.claude.com/docs/en/about-claude/pricing',
    verifiedOn: '2026-09-27',
  },
  web_search_openai: {
    unit: 'request',
    providerCogsMicrousd: 10_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedOn: '2026-09-27',
  },
  places_text_search: {
    unit: 'request',
    providerCogsMicrousd: 35_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://developers.google.com/maps/billing-and-pricing/pricing',
    verifiedOn: '2026-09-05',
  },
  image_generation_openai_low: {
    unit: 'image',
    providerCogsMicrousd: 10_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_openai_medium: {
    unit: 'image',
    providerCogsMicrousd: 40_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_openai_high: {
    unit: 'image',
    providerCogsMicrousd: 170_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_google: {
    unit: 'image',
    providerCogsMicrousd: 67_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedOn: '2026-09-08',
  },
  video_second: {
    unit: 'second',
    providerCogsMicrousd: 400_000,
    providerCogsBasis: 'derived_from_model',
    includedInPlans: 'no_plan',
    source: CATALOGUE_SOURCE,
    verifiedOn: '2026-09-10',
  },
  voice_live_minute: {
    unit: 'minute',
    providerCogsMicrousd: 50_000,
    providerCogsBasis: 'derived_from_model',
    includedInPlans: 'no_plan',
    source: CATALOGUE_SOURCE,
    verifiedOn: '2026-09-10',
  },
  transcription_minute: {
    unit: 'minute',
    providerCogsMicrousd: 6_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
  },
  sandbox_vcpu_second: {
    unit: 'second',
    providerCogsMicrousd: 14,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://e2b.dev/pricing',
    verifiedOn: '2026-09-27',
  },
  sandbox_gib_second: {
    unit: 'second',
    providerCogsMicrousd: 4.5,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://e2b.dev/pricing',
    verifiedOn: '2026-09-27',
  },
  hosted_code_execution_openai_session: {
    unit: 'session',
    providerCogsMicrousd: 30_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedOn: '2026-09-27',
  },
  hosted_code_execution_anthropic_hour: {
    unit: 'hour',
    providerCogsMicrousd: 50_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source:
      'https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool (an upper bound: the 1,550 free organization hours a month cannot be tracked from one response)',
    verifiedOn: '2026-09-27',
  },
  object_storage_gib_month: infrastructureRate('gibibyte_month'),
  database_compute_second: infrastructureRate('second'),
  vector_query_request: infrastructureRate('request'),
  notification_delivery_request: infrastructureRate('request'),
  email_message_request: infrastructureRate('request'),
  network_egress_gib: infrastructureRate('gibibyte'),
  connector_call_request: infrastructureRate('request'),
  artifact_storage_gib_month: infrastructureRate('gibibyte_month'),
};

export const RATE_CARD_PROVIDER_COGS_ENV = {
  web_search_perplexity: 'AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL',
  web_search_grounding: 'AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL',
  places_text_search: 'AGI_PLACES_SEARCH_MICROUSD_PER_CALL',
  object_storage_gib_month: 'AGI_OBJECT_STORAGE_MICROUSD_PER_GIB_MONTH',
  database_compute_second: 'AGI_DATABASE_COMPUTE_MICROUSD_PER_SECOND',
  vector_query_request: 'AGI_VECTOR_QUERY_MICROUSD_PER_REQUEST',
  notification_delivery_request: 'AGI_NOTIFICATION_MICROUSD_PER_DELIVERY',
  email_message_request: 'AGI_EMAIL_MICROUSD_PER_MESSAGE',
  network_egress_gib: 'AGI_EGRESS_MICROUSD_PER_GIB',
  connector_call_request: 'AGI_CONNECTOR_CALL_MICROUSD_PER_REQUEST',
  artifact_storage_gib_month: 'AGI_ARTIFACT_STORAGE_MICROUSD_PER_GIB_MONTH',
} as const satisfies Partial<Record<RateCardFeature, string>>;

function providerCogsEnvName(feature: RateCardFeature): string | undefined {
  return (RATE_CARD_PROVIDER_COGS_ENV as Partial<Record<RateCardFeature, string>>)[feature];
}

export type RateCardEnv = Readonly<Record<string, string | undefined>>;

export interface ResolvedFeatureRate extends RateCardEntry {
  readonly feature: RateCardFeature;
  /** The env var consulted for this feature's provider rate, when one exists. */
  readonly overrideEnv?: string;
  /** True when that env var held a usable number and replaced the published rate. */
  readonly overrideApplied: boolean;
  /** True when that env var was set to something unusable; the published rate stands. */
  readonly overrideInvalid: boolean;
}

function ambientEnv(): RateCardEnv {
  return typeof process === 'undefined' ? {} : (process.env as RateCardEnv);
}

/**
 * The rate card row for `feature`, with the deployment's provider-cost override
 * applied where the platform publishes one. An unusable override never silently
 * becomes a price: it is reported so the caller can log it and the published
 * rate is used.
 */
export function resolveFeatureRate(
  feature: RateCardFeature,
  env: RateCardEnv = ambientEnv(),
): ResolvedFeatureRate {
  const entry = FEATURE_RATE_CARD[feature];
  const overrideEnv = providerCogsEnvName(feature);
  if (!overrideEnv) {
    return { ...entry, feature, overrideApplied: false, overrideInvalid: false };
  }

  const raw = env[overrideEnv];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ...entry, feature, overrideEnv, overrideApplied: false, overrideInvalid: false };
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ...entry, feature, overrideEnv, overrideApplied: false, overrideInvalid: true };
  }

  return {
    ...entry,
    feature,
    providerCogsMicrousd: parsed,
    providerCogsBasis: 'rate_card',
    overrideEnv,
    overrideApplied: true,
    overrideInvalid: false,
  };
}

export function unpricedRateCardFeatures(env: RateCardEnv = ambientEnv()): RateCardFeature[] {
  return RATE_CARD_FEATURES.filter((feature) => {
    const cost = resolveFeatureRate(feature, env).providerCogsMicrousd;
    return cost === null || !(cost > 0);
  });
}

export function customerChargeMicrousd(
  feature: RateCardFeature,
  options: { included: boolean } = { included: false },
): number {
  const entry = FEATURE_RATE_CARD[feature];
  if (entry.includedInPlans === 'all_plans') return 0;
  if (entry.includedInPlans === 'interactive_chat' && options.included) return 0;
  return chargeMicrousdForProviderCost(resolveFeatureRate(feature).providerCogsMicrousd ?? 0);
}

export const SANDBOX_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';
export const DEFAULT_SANDBOX_VCPU_COUNT = 2;
export const DEFAULT_SANDBOX_MEMORY_GIB = 4;

export interface SandboxComputeShape {
  readonly vcpuCount?: number | null;
  readonly memoryGib?: number | null;
}

export type SandboxComputeRate =
  | { readonly ok: true; readonly microusdPerSecond: number; readonly overrideInvalid: boolean }
  | { readonly ok: false; readonly overrideInvalid: boolean };

function positiveOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback;
}

export function sandboxComputeRate(
  shape?: SandboxComputeShape,
  env: RateCardEnv = ambientEnv(),
): SandboxComputeRate {
  const raw = env[SANDBOX_COMPUTE_RATE_ENV]?.trim() ?? '';
  const override = raw.length > 0 ? Number.parseFloat(raw) : Number.NaN;
  if (Number.isFinite(override) && override > 0) {
    return { ok: true, microusdPerSecond: override, overrideInvalid: false };
  }
  const overrideInvalid = raw.length > 0;
  const vcpu = resolveFeatureRate('sandbox_vcpu_second', env).providerCogsMicrousd;
  const gib = resolveFeatureRate('sandbox_gib_second', env).providerCogsMicrousd;
  if (vcpu === null || gib === null || !(vcpu > 0) || !(gib > 0)) {
    return { ok: false, overrideInvalid };
  }
  const vcpuCount = positiveOr(shape?.vcpuCount, DEFAULT_SANDBOX_VCPU_COUNT);
  const memoryGib = positiveOr(shape?.memoryGib, DEFAULT_SANDBOX_MEMORY_GIB);
  return {
    ok: true,
    microusdPerSecond: Math.round(vcpuCount * vcpu + memoryGib * gib),
    overrideInvalid,
  };
}
