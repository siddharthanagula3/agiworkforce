export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'basic'
  | 'pro'
  | 'max'
  | 'max_15x'
  | 'team'
  | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

export const SELF_SERVE_PAID_PLAN_TIERS = [
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
] as const satisfies readonly BillingPlanTier[];
export type SelfServePaidPlanTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

export const SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER = [
  'basic',
  'pro',
  'max',
  'max_15x',
] as const satisfies readonly SelfServePaidPlanTier[];
export type SelfServeIndividualPlanTier = (typeof SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER)[number];

export function isSelfServePaidPlanTier(
  value: string | null | undefined,
): value is SelfServePaidPlanTier {
  return (
    typeof value === 'string' && (SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(value)
  );
}

export function isSelfServeIndividualPlanTier(
  value: string | null | undefined,
): value is SelfServeIndividualPlanTier {
  return (
    typeof value === 'string' &&
    (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).includes(value)
  );
}

export function hasSelfServeUpgradePath(value: string | null | undefined): boolean {
  return getNextUpgradeTier(value) !== null;
}

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd?: number;
  yearlyPriceUsd?: number;
  monthlyPriceInr?: number;
  perSeat?: boolean;
  contractPriced?: true;
}

export function isPerSeatBillingPlan(plan: string | null | undefined): boolean {
  return getBillingPlanPricing(plan).perSeat === true;
}

export const MIN_PURCHASABLE_SEATS = 2;
export const MAX_PURCHASABLE_SEATS = 999_999;

export function normalizePurchasableSeats(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < MIN_PURCHASABLE_SEATS || value > MAX_PURCHASABLE_SEATS) return null;
  return value;
}

export const BILLING_PLAN_PRICING = {
  'local-only': {
    id: 'local-only',
    label: 'Local Mode',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  byok: {
    id: 'byok',
    label: 'Local Mode + BYOK',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  free: {
    id: 'free',
    label: 'Free',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    monthlyPriceUsd: 7,
    yearlyPriceUsd: 0,
    monthlyPriceInr: 399,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 20,
    yearlyPriceUsd: 200,
    monthlyPriceInr: 1999,
  },
  max: {
    id: 'max',
    label: 'Max 5x',
    monthlyPriceUsd: 100,
    yearlyPriceUsd: 0,
    monthlyPriceInr: 9999,
  },
  max_15x: {
    id: 'max_15x',
    label: 'Max 15x',
    monthlyPriceUsd: 200,
    yearlyPriceUsd: 0,
    monthlyPriceInr: 24999,
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyPriceUsd: 25,
    yearlyPriceUsd: 240,
    monthlyPriceInr: 1999,
    perSeat: true,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    contractPriced: true,
  },
} satisfies Record<BillingPlanTier, BillingPlanPricing>;

export type BillingSurface = 'web' | 'desktop' | 'mobile';

export const PLAN_SURFACE_VISIBILITY: Record<BillingPlanTier, readonly BillingSurface[]> = {
  'local-only': ['web', 'desktop', 'mobile'],
  byok: ['web', 'desktop', 'mobile'],
  free: ['web', 'desktop', 'mobile'],
  basic: ['web', 'desktop', 'mobile'],
  pro: ['web', 'desktop', 'mobile'],
  max: ['web', 'desktop', 'mobile'],
  max_15x: ['web', 'desktop', 'mobile'],
  team: ['web', 'desktop', 'mobile'],
  enterprise: ['web', 'desktop', 'mobile'],
};

export function isPlanSelectableOnSurface(
  plan: string | null | undefined,
  surface: BillingSurface,
): boolean {
  return PLAN_SURFACE_VISIBILITY[normalizeBillingPlanTier(plan)].includes(surface);
}

export function isBillingPlanTier(value: string | null | undefined): value is BillingPlanTier {
  if (!value) return false;
  return value in BILLING_PLAN_PRICING;
}

export function isFreeBillingPlanTier(value: string | null | undefined): value is 'free' {
  return value === 'free';
}

export function isBasicPlanTier(value: string | null | undefined): value is 'basic' {
  return value === 'basic';
}

export function isTeamPlanTier(value: string | null | undefined): value is 'team' {
  return value === 'team';
}

export function isProPlanTier(value: string | null | undefined): value is 'pro' {
  return value === 'pro';
}

export function isMaxPlanTier(value: string | null | undefined): value is 'max' {
  return value === 'max';
}

export function isMax15xPlanTier(value: string | null | undefined): value is 'max_15x' {
  return value === 'max_15x';
}

export function isLocalOnlyPlanTier(value: string | null | undefined): value is 'local-only' {
  return value === 'local-only';
}

export function isByokPlanTier(value: string | null | undefined): value is 'byok' {
  return value === 'byok';
}

export function isFreeOfChargePlanTier(value: string | null | undefined): boolean {
  return isLocalOnlyPlanTier(value) || isByokPlanTier(value) || isFreeBillingPlanTier(value);
}

export type BillingPlanCapability =
  | 'managed_chat'
  | 'chat_tools'
  | 'projects'
  | 'memory_personalization'
  | 'skills_connectors'
  | 'cloud_sync'
  | 'agi_work'
  | 'image_generation'
  | 'video_generation'
  | 'managed_api'
  | 'developer_surfaces'
  | 'team_admin'
  | 'enterprise_controls';

const CLOUD_CHAT_TIERS = ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;
const PRO_TIERS = ['pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

export const BILLING_PLAN_CAPABILITY_TIERS: Readonly<
  Record<BillingPlanCapability, readonly BillingPlanTier[]>
> = Object.freeze({
  managed_chat: CLOUD_CHAT_TIERS,
  chat_tools: CLOUD_CHAT_TIERS,
  projects: CLOUD_CHAT_TIERS,
  memory_personalization: CLOUD_CHAT_TIERS,
  skills_connectors: CLOUD_CHAT_TIERS,
  cloud_sync: CLOUD_CHAT_TIERS,
  agi_work: PRO_TIERS,
  image_generation: PRO_TIERS,
  video_generation: ['max_15x', 'enterprise'],
  managed_api: PRO_TIERS,
  developer_surfaces: PRO_TIERS,
  team_admin: ['team', 'enterprise'],
  enterprise_controls: ['enterprise'],
});

export function canUseBillingPlanCapability(
  plan: string | null | undefined,
  capability: BillingPlanCapability,
): boolean {
  if (!isBillingPlanTier(plan)) return false;
  return BILLING_PLAN_CAPABILITY_TIERS[capability].includes(plan);
}

export type BillingPlanLimit = number | 'unlimited' | 'custom';

const MINUTE_MS = 60_000;

/**
 * Absolute per-user safety ceiling for live managed sandboxes.
 *
 * Plan tiers can grant fewer slots, but no plan may exceed five. Managed turns
 * can still run in parallel without a sandbox, so this bounds stateful compute
 * cost without turning the chat-concurrency dimension into the same setting.
 */
export const MAX_MANAGED_SANDBOXES_PER_USER = 5;

export const PLATFORM_SCHEDULE_RUNS_PER_SWEEP = 50;

export interface BillingPlanProductLimits {
  projects: BillingPlanLimit;
  customMcpServers: BillingPlanLimit;
  knowledgeStorageBytes: BillingPlanLimit;
  maxConcurrentTurns: BillingPlanLimit;
  maxSandboxes: BillingPlanLimit;
  sandboxTtlMs: number;
  maxConnectorTools: BillingPlanLimit;
  maxScheduledTasks: BillingPlanLimit;
}

export const BILLING_PLAN_PRODUCT_LIMITS: Readonly<
  Record<BillingPlanTier, BillingPlanProductLimits>
> = Object.freeze({
  'local-only': {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
  },
  byok: {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
  },
  free: {
    projects: 1,
    knowledgeStorageBytes: 104857600,
    customMcpServers: 1,
    maxConcurrentTurns: 1,
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 25,
    maxScheduledTasks: 0,
  },
  basic: {
    projects: 5,
    knowledgeStorageBytes: 1073741824,
    customMcpServers: 5,
    maxConcurrentTurns: 2,
    maxSandboxes: 2,
    sandboxTtlMs: 10 * MINUTE_MS,
    maxConnectorTools: 50,
    maxScheduledTasks: 2,
  },
  pro: {
    projects: 25,
    knowledgeStorageBytes: 10737418240,
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 5,
  },
  max: {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 8,
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 30 * MINUTE_MS,
    maxConnectorTools: 300,
    maxScheduledTasks: 10,
  },
  max_15x: {
    projects: 'unlimited',
    knowledgeStorageBytes: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 12,
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 60 * MINUTE_MS,
    maxConnectorTools: 500,
    maxScheduledTasks: 25,
  },
  team: {
    projects: 25,
    knowledgeStorageBytes: 26843545600,
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 5,
  },
  enterprise: {
    projects: 'custom',
    knowledgeStorageBytes: 'custom',
    customMcpServers: 'custom',
    maxConcurrentTurns: 'custom',
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 60 * MINUTE_MS,
    maxConnectorTools: 'custom',
    maxScheduledTasks: 'custom',
  },
});

export function getBillingPlanProductLimits(
  plan: string | null | undefined,
): BillingPlanProductLimits | null {
  if (!isBillingPlanTier(plan)) return null;
  return BILLING_PLAN_PRODUCT_LIMITS[plan];
}

export function toEnforceableBillingPlanLimit(limit: BillingPlanLimit | undefined): number | null {
  if (limit === 'unlimited' || limit === 'custom') return null;
  return typeof limit === 'number' ? limit : 0;
}

export function getPlanMaxConcurrentTurns(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConcurrentTurns);
}

export function getPlanMaxSandboxes(plan: string | null | undefined): number {
  const configured = toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxSandboxes);
  return configured === null
    ? MAX_MANAGED_SANDBOXES_PER_USER
    : Math.min(configured, MAX_MANAGED_SANDBOXES_PER_USER);
}

export function getPlanSandboxTtlMs(plan: string | null | undefined): number {
  return getBillingPlanProductLimits(plan)?.sandboxTtlMs ?? 0;
}

export function getPlanMaxConnectorTools(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConnectorTools);
}

export function getPlanMaxScheduledTasks(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxScheduledTasks);
}

export function getNextUpgradeTier(
  plan: string | null | undefined,
): SelfServeIndividualPlanTier | null {
  const current = normalizeBillingPlanTier(plan);
  const index = (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly BillingPlanTier[]).indexOf(
    current,
  );
  if (index === -1) {
    return current === 'team' || current === 'enterprise'
      ? null
      : (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[0] ?? null);
  }
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[index + 1] ?? null;
}

export type ManagedQuotaBlockKind =
  | 'free_trial'
  | 'rolling_window'
  | 'billing_period'
  | 'rate_limit'
  /**
   * The plan simply does not include the capability, nothing was exhausted and
   * nothing resets. Distinct from every other kind here, which are all "you had
   * an allowance and used it up", so the card must not offer a reset time.
   */
  | 'plan_capability';

export interface ManagedQuotaBlockPresentation {
  kind: ManagedQuotaBlockKind;
  feature: 'token_cap' | 'model_access' | 'paid_capability' | 'rolling_capacity' | 'request_rate';
  showUpgradeCta: boolean;
  showResetTime: boolean;
  suggestStandardModel: boolean;
  clearedByCredits: boolean;
  reason: string;
}

const MANAGED_QUOTA_BLOCKS: Readonly<Record<string, ManagedQuotaBlockPresentation>> = Object.freeze(
  {
    free_trial_token_budget_reached: {
      kind: 'free_trial',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'You have reached the current free usage limit. Upgrade for more hosted capacity.',
    },
    free_trial_model_only: {
      kind: 'free_trial',
      feature: 'model_access',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: true,
      clearedByCredits: false,
      reason: 'That model requires a paid plan. Choose a free model or upgrade.',
    },
    free_trial_feature_unavailable: {
      kind: 'free_trial',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'That capability requires a paid plan.',
    },
    plan_upgrade_required: {
      kind: 'plan_capability',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'That capability is not included in your current plan.',
    },
    rolling_five_hour_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason:
        'You have used your rolling 5-hour capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    rolling_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason:
        'You have used your rolling weekly capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    flagship_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: true,
      clearedByCredits: true,
      reason:
        'You have used your weekly capacity for the most capable models. Choose a standard model, wait for capacity to refill, or upgrade.',
    },
    insufficient_credits: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_limit_exceeded: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: true,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_credit_limit_reached: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    rate_limit_exceeded: {
      kind: 'rate_limit',
      feature: 'request_rate',
      showUpgradeCta: false,
      showResetTime: true,
      suggestStandardModel: false,
      clearedByCredits: false,
      reason: 'Too many requests in a short time. Please wait a moment and try again.',
    },
  },
);

export function classifyManagedQuotaErrorCode(
  code: string | null | undefined,
): ManagedQuotaBlockPresentation | null {
  if (typeof code !== 'string' || code.length === 0) return null;
  return MANAGED_QUOTA_BLOCKS[code.trim().toLowerCase()] ?? null;
}

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier {
  if (!value) return 'free';
  const normalized = value.toLowerCase();
  return isBillingPlanTier(normalized) ? normalized : 'free';
}

export function getBillingPlanPricing(plan: string | null | undefined): BillingPlanPricing {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)];
}

export function isContractPricedPlan(plan: string | null | undefined): boolean {
  return getBillingPlanPricing(plan).contractPriced === true;
}

export function getPlanPriceUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number | null {
  const pricing = getBillingPlanPricing(plan);
  const amount = interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
  return typeof amount === 'number' ? amount : null;
}

export function getPlanPriceCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number | null {
  const usd = getPlanPriceUsd(plan, interval);
  return usd === null ? null : Math.round(usd * 100);
}

export type PublishedPricePlanTier = Exclude<BillingPlanTier, 'enterprise'>;

export function getPublishedPlanPriceUsd(
  plan: PublishedPricePlanTier,
  interval: BillingInterval = 'monthly',
): number {
  const pricing = BILLING_PLAN_PRICING[plan];
  return interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
}

export function getPublishedPlanPriceCents(
  plan: PublishedPricePlanTier,
  interval: BillingInterval = 'monthly',
): number {
  return Math.round(getPublishedPlanPriceUsd(plan, interval) * 100);
}

export function getPlanPriceInr(plan: string | null | undefined): number | null {
  const pricing = getBillingPlanPricing(plan);
  return typeof pricing.monthlyPriceInr === 'number' ? pricing.monthlyPriceInr : null;
}
