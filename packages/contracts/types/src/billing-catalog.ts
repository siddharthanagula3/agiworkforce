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

/**
 * Plans that can be purchased without sales-assisted provisioning.
 * Team remains a real catalog/entitlement tier for existing and manually
 * provisioned customers, but it must not enter the personal checkout path
 * until organization ownership, licensed seats, and member lifecycle exist.
 */
export const SELF_SERVE_PAID_PLAN_TIERS = [
  'basic',
  'pro',
  'max',
  'max_15x',
] as const satisfies readonly BillingPlanTier[];
export type SelfServePaidPlanTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  /** India-specific monthly price in INR, when it differs from a straight USD conversion. */
  monthlyPriceInr?: number;
}

export const BILLING_PLAN_PRICING: Record<BillingPlanTier, BillingPlanPricing> = {
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
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
  },
};

/** Product surfaces that render plan-selection / upgrade / comparison lists. */
export type BillingSurface = 'web' | 'desktop' | 'mobile';

/**
 * Surfaces on which each plan tier is offered as a SELECTABLE / suggested
 * upgrade target in plan-selection, upgrade, and comparison lists.
 *
 * DISPLAY-ONLY. This does NOT affect pricing math, tier resolution, price-id
 * mapping, or an existing subscriber's ability to see their own current plan
 * in billing — it only governs whether a tier appears as a choosable option
 * on a given surface.
 *
 * Basic is selectable on every customer app surface. Managed developer
 * surfaces are gated separately by `developer_surfaces` capability.
 */
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

/**
 * Whether `plan` may be shown as a selectable/upgrade option on `surface`.
 * Unknown values normalize to `free` (visible everywhere). Use this at every
 * plan-LIST render site; do not use it for tier resolution or current-plan
 * display (an existing subscriber must always see their own plan).
 */
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

/**
 * Server-enforced product capabilities. Keep client comparison tables and API
 * gates on this contract instead of copying tier-order checks into each route.
 * Explicit sets are intentional: Team does not automatically inherit the
 * individual Max 15x media allowance, and Enterprise can receive negotiated
 * capabilities without pretending its price is a numeric tier rank.
 */
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

/** Fail-closed capability check for privileged/server boundaries. */
export function canUseBillingPlanCapability(
  plan: string | null | undefined,
  capability: BillingPlanCapability,
): boolean {
  if (!isBillingPlanTier(plan)) return false;
  return BILLING_PLAN_CAPABILITY_TIERS[capability].includes(plan);
}

export type BillingPlanLimit = number | 'unlimited' | 'custom';

export interface BillingPlanProductLimits {
  projects: BillingPlanLimit;
  customMcpServers: BillingPlanLimit;
}

/** Public, enforceable product limits; private usage budgets live separately. */
export const BILLING_PLAN_PRODUCT_LIMITS: Readonly<
  Record<BillingPlanTier, BillingPlanProductLimits>
> = Object.freeze({
  'local-only': { projects: 'unlimited', customMcpServers: 'unlimited' },
  byok: { projects: 'unlimited', customMcpServers: 'unlimited' },
  free: { projects: 1, customMcpServers: 1 },
  basic: { projects: 5, customMcpServers: 5 },
  pro: { projects: 25, customMcpServers: 25 },
  max: { projects: 'unlimited', customMcpServers: 'unlimited' },
  max_15x: { projects: 'unlimited', customMcpServers: 'unlimited' },
  team: { projects: 25, customMcpServers: 25 },
  enterprise: { projects: 'custom', customMcpServers: 'custom' },
});

export function getBillingPlanProductLimits(
  plan: string | null | undefined,
): BillingPlanProductLimits | null {
  if (!isBillingPlanTier(plan)) return null;
  return BILLING_PLAN_PRODUCT_LIMITS[plan];
}

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier {
  if (!value) return 'free';
  const normalized = value.toLowerCase();
  return isBillingPlanTier(normalized) ? normalized : 'free';
}

export function getBillingPlanPricing(plan: string | null | undefined): BillingPlanPricing {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)];
}

export function getPlanPriceUsd(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  const pricing = getBillingPlanPricing(plan);
  return interval === 'yearly' ? pricing.yearlyPriceUsd : pricing.monthlyPriceUsd;
}

export function getPlanPriceCents(
  plan: string | null | undefined,
  interval: BillingInterval = 'monthly',
): number {
  return Math.round(getPlanPriceUsd(plan, interval) * 100);
}

/** India-specific monthly price in INR for `plan`, or null if not defined (USD-only tier). */
export function getPlanPriceInr(plan: string | null | undefined): number | null {
  const pricing = getBillingPlanPricing(plan);
  return typeof pricing.monthlyPriceInr === 'number' ? pricing.monthlyPriceInr : null;
}
