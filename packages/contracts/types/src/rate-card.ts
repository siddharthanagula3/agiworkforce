import { TOP_UP_UNITS_PER_USD } from './billing-topups';

export const MICROUSD_PER_USD = 1_000_000;
export const MICROUSD_PER_CENT = 10_000;

/** One credit is a fiftieth of a dollar, so a credit is this many microUSD. */
export const MICROUSD_PER_CREDIT = MICROUSD_PER_USD / TOP_UP_UNITS_PER_USD;

export function creditsFromMicrousd(microusd: number): number {
  if (!Number.isFinite(microusd) || microusd <= 0) return 0;
  return microusd / MICROUSD_PER_CREDIT;
}

export function microusdFromCents(cents: number): number {
  return Math.round(cents * MICROUSD_PER_CENT);
}

export function centsFromMicrousdCeil(microusd: number): number {
  if (!Number.isFinite(microusd) || microusd <= 0) return 0;
  return Math.ceil(microusd / MICROUSD_PER_CENT);
}

export const RATE_CARD_FEATURES = [
  'web_search_perplexity',
  'web_search_grounding',
  'image_generation_openai_low',
  'image_generation_openai_medium',
  'image_generation_openai_high',
  'image_generation_google',
  'video_second',
  'voice_live_minute',
  'transcription_minute',
  'sandbox_vcpu_second',
  'sandbox_gib_second',
  'computer_use_request',
] as const;

export type RateCardFeature = (typeof RATE_CARD_FEATURES)[number];

export const RATE_CARD_UNITS = ['request', 'image', 'second', 'minute'] as const;
export type RateCardUnit = (typeof RATE_CARD_UNITS)[number];

/**
 * `rate_card` means the number on this row is the whole answer.
 * `derived_from_model` means the row carries a reference figure only and the
 * live amount comes from the model catalogue's per-unit pricing for whichever
 * model served the call.
 */
export const RATE_CARD_BASES = ['rate_card', 'derived_from_model'] as const;
export type RateCardBasis = (typeof RATE_CARD_BASES)[number];

/**
 * `all_plans` is never charged to a customer on any plan.
 * `interactive_chat` is included while an interactive chat turn stays inside
 * its plan's bound, and charged at `customerMicrousd` outside it: on automated
 * and developer surfaces, in deep research, and past the per-plan call bound.
 * `no_plan` is charged on every plan.
 */
export const RATE_CARD_INCLUSIONS = ['all_plans', 'interactive_chat', 'no_plan'] as const;
export type RateCardInclusion = (typeof RATE_CARD_INCLUSIONS)[number];

export interface RateCardEntry {
  readonly unit: RateCardUnit;
  /** Canonical price the customer pays per unit. Null when `customerBasis` is `derived_from_model`. */
  readonly customerMicrousd: number | null;
  readonly customerBasis: RateCardBasis;
  /** Published provider list rate per unit. Null when `providerCogsBasis` is `derived_from_model`. */
  readonly providerCogsMicrousd: number | null;
  readonly providerCogsBasis: RateCardBasis;
  readonly includedInPlans: RateCardInclusion;
  readonly source: string;
  readonly verifiedOn: string;
  /** Set when the provider figure is inferred rather than published as a per-unit rate. */
  readonly estimate?: true;
}

const CATALOGUE_SOURCE = 'packages/contracts/types/src/models.json';

export const FEATURE_RATE_CARD: Readonly<Record<RateCardFeature, RateCardEntry>> = {
  web_search_perplexity: {
    unit: 'request',
    customerMicrousd: 10_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 5_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'interactive_chat',
    source: 'https://docs.perplexity.ai/getting-started/pricing',
    verifiedOn: '2026-09-10',
  },
  web_search_grounding: {
    unit: 'request',
    customerMicrousd: 20_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 14_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'interactive_chat',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedOn: '2026-09-08',
  },
  image_generation_openai_low: {
    unit: 'image',
    customerMicrousd: 50_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 10_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_openai_medium: {
    unit: 'image',
    customerMicrousd: 50_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 40_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_openai_high: {
    unit: 'image',
    customerMicrousd: 210_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 170_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  image_generation_google: {
    unit: 'image',
    customerMicrousd: 30_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 67_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedOn: '2026-09-08',
  },
  video_second: {
    unit: 'second',
    customerMicrousd: null,
    customerBasis: 'derived_from_model',
    providerCogsMicrousd: 400_000,
    providerCogsBasis: 'derived_from_model',
    includedInPlans: 'no_plan',
    source: CATALOGUE_SOURCE,
    verifiedOn: '2026-09-10',
  },
  voice_live_minute: {
    unit: 'minute',
    customerMicrousd: 50_000,
    customerBasis: 'rate_card',
    providerCogsMicrousd: 30_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    verifiedOn: '2026-09-10',
    estimate: true,
  },
  transcription_minute: {
    unit: 'minute',
    customerMicrousd: null,
    customerBasis: 'derived_from_model',
    providerCogsMicrousd: 6_000,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://platform.openai.com/docs/pricing',
    verifiedOn: '2026-09-10',
  },
  sandbox_vcpu_second: {
    unit: 'second',
    customerMicrousd: null,
    customerBasis: 'derived_from_model',
    providerCogsMicrousd: 14,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://e2b.dev/pricing',
    verifiedOn: '2026-09-10',
  },
  sandbox_gib_second: {
    unit: 'second',
    customerMicrousd: null,
    customerBasis: 'derived_from_model',
    providerCogsMicrousd: 4.5,
    providerCogsBasis: 'rate_card',
    includedInPlans: 'no_plan',
    source: 'https://e2b.dev/pricing',
    verifiedOn: '2026-09-10',
  },
  computer_use_request: {
    unit: 'request',
    customerMicrousd: null,
    customerBasis: 'derived_from_model',
    providerCogsMicrousd: null,
    providerCogsBasis: 'derived_from_model',
    includedInPlans: 'no_plan',
    source: CATALOGUE_SOURCE,
    verifiedOn: '2026-09-10',
  },
};

export const RATE_CARD_PROVIDER_COGS_ENV = {
  web_search_perplexity: 'AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL',
  web_search_grounding: 'AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL',
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
  if (!Number.isFinite(parsed) || parsed < 0) {
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

/**
 * What the customer pays for one unit of `feature`. `included` is the calling
 * surface's answer to the row's `includedInPlans` policy; a row the plan does
 * not include falls through to the canonical price.
 */
export function customerChargeMicrousd(
  feature: RateCardFeature,
  options: { included: boolean } = { included: false },
): number {
  const entry = FEATURE_RATE_CARD[feature];
  if (entry.includedInPlans === 'all_plans') return 0;
  if (entry.includedInPlans === 'interactive_chat' && options.included) return 0;
  return entry.customerMicrousd ?? 0;
}
