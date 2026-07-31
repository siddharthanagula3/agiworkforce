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

export function isSelfServePaidPlanTier(
  value: string | null | undefined,
): value is SelfServePaidPlanTier {
  return (
    typeof value === 'string' && (SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).includes(value)
  );
}

/**
 * Whether a self-serve upgrade still exists for this tier — i.e. whether an
 * "Upgrade" affordance should be offered at all.
 *
 * False for `max_15x` (the top self-serve plan, so there is nothing above it to
 * buy) and for `team`/`enterprise` (sales-assisted; a checkout CTA would be
 * wrong). Offering "Upgrade" to someone already on the highest plan reads as a
 * billing error and undermines trust in what they are paying for.
 *
 * Shared rather than inlined per surface so web, desktop and mobile cannot
 * drift on who is shown an upgrade prompt.
 */
export function hasSelfServeUpgradePath(value: string | null | undefined): boolean {
  return value !== 'max_15x' && value !== 'team' && value !== 'enterprise';
}

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
    // Team is sales-assisted. Zero means there is no public self-serve price;
    // contracted amounts must come from the customer's invoice.
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
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

const MINUTE_MS = 60_000;

/**
 * Absolute per-user safety ceiling for live managed sandboxes.
 *
 * Plan tiers can grant fewer slots, but no plan may exceed five. Managed turns
 * can still run in parallel without a sandbox, so this bounds stateful compute
 * cost without turning the chat-concurrency dimension into the same setting.
 */
export const MAX_MANAGED_SANDBOXES_PER_USER = 5;

export interface BillingPlanProductLimits {
  projects: BillingPlanLimit;
  customMcpServers: BillingPlanLimit;
  /**
   * GOV-3: maximum managed turns a single user may have in flight at once
   * (concurrent chats / parallel streams). Enforced by the managed-turn
   * concurrency slots in `apps/web/lib/rate-limit.ts`.
   *
   * `local-only` / `byok` run against the user's own runtime or key, so the
   * platform has no compute cost to bound and they stay uncapped here; every
   * managed tier is bounded because each in-flight turn is provider spend.
   */
  maxConcurrentTurns: BillingPlanLimit;
  /**
   * GOV-4: maximum live (running OR paused) managed sandboxes a user may hold
   * across all conversations. Enforced in `apps/web/lib/e2b/runtime.ts`.
   * Managed compute is never available to `local-only` / `byok`, so those tiers
   * are 0 (deny) rather than unlimited.
   */
  maxSandboxes: BillingPlanLimit;
  /**
   * GOV-4: managed sandbox lifetime before the provider auto-pauses (scoped) or
   * kills (ephemeral) it. Always a concrete duration — an "unlimited" sandbox
   * lifetime is unbillable — and 0 means the tier gets no managed sandbox.
   */
  sandboxTtlMs: number;
  /**
   * GOV-7: maximum connector (MCP) tool definitions admitted into one managed
   * turn's tool set. Bounds both prompt size and the tool-loop fan-out.
   */
  maxConnectorTools: BillingPlanLimit;
  /**
   * GOV-7 / GOV-8: maximum scheduled tasks a user may own. Every firing runs an
   * unattended managed turn, so this is a spend ceiling, not a UI nicety.
   */
  maxScheduledTasks: BillingPlanLimit;
}

/** Public, enforceable product limits; private usage budgets live separately. */
export const BILLING_PLAN_PRODUCT_LIMITS: Readonly<
  Record<BillingPlanTier, BillingPlanProductLimits>
> = Object.freeze({
  'local-only': {
    projects: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
  },
  byok: {
    projects: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 'unlimited',
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 'unlimited',
    maxScheduledTasks: 0,
  },
  // Free is metered in the separate free-trial micro-USD ledger and never
  // draws on the paid cents ledger, so the two dimensions that spend from that
  // ledger — managed sandboxes and unattended scheduled runs — are 0 (deny)
  // rather than a token allowance that would 402 on first use.
  free: {
    projects: 1,
    customMcpServers: 1,
    maxConcurrentTurns: 1,
    maxSandboxes: 0,
    sandboxTtlMs: 0,
    maxConnectorTools: 25,
    maxScheduledTasks: 0,
  },
  basic: {
    projects: 5,
    customMcpServers: 5,
    maxConcurrentTurns: 2,
    maxSandboxes: 2,
    sandboxTtlMs: 10 * MINUTE_MS,
    maxConnectorTools: 50,
    maxScheduledTasks: 5,
  },
  pro: {
    projects: 25,
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 25,
  },
  max: {
    projects: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 8,
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 30 * MINUTE_MS,
    maxConnectorTools: 300,
    maxScheduledTasks: 100,
  },
  max_15x: {
    projects: 'unlimited',
    customMcpServers: 'unlimited',
    maxConcurrentTurns: 12,
    maxSandboxes: MAX_MANAGED_SANDBOXES_PER_USER,
    sandboxTtlMs: 60 * MINUTE_MS,
    maxConnectorTools: 500,
    maxScheduledTasks: 250,
  },
  team: {
    projects: 25,
    customMcpServers: 25,
    maxConcurrentTurns: 4,
    maxSandboxes: 5,
    sandboxTtlMs: 20 * MINUTE_MS,
    maxConnectorTools: 150,
    maxScheduledTasks: 25,
  },
  enterprise: {
    projects: 'custom',
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

/**
 * GOV-3 / GOV-4 / GOV-7: resolve one catalog limit to an enforceable ceiling.
 *
 *   number      -> that ceiling
 *   'unlimited' -> null (no product-side ceiling)
 *   'custom'    -> null (negotiated Enterprise contract; the private managed
 *                  usage budget, not this table, is what bounds their spend)
 *   undefined   -> 0 (unknown tier fails CLOSED)
 */
export function toEnforceableBillingPlanLimit(limit: BillingPlanLimit | undefined): number | null {
  if (limit === 'unlimited' || limit === 'custom') return null;
  return typeof limit === 'number' ? limit : 0;
}

/** GOV-3: max in-flight managed turns for `plan`; null = uncapped. */
export function getPlanMaxConcurrentTurns(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConcurrentTurns);
}

/** GOV-4: max live managed sandboxes for `plan`, always capped at five per user. */
export function getPlanMaxSandboxes(plan: string | null | undefined): number {
  const configured = toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxSandboxes);
  return configured === null
    ? MAX_MANAGED_SANDBOXES_PER_USER
    : Math.min(configured, MAX_MANAGED_SANDBOXES_PER_USER);
}

/** GOV-4: managed sandbox lifetime for `plan`; 0 = no managed sandbox. */
export function getPlanSandboxTtlMs(plan: string | null | undefined): number {
  return getBillingPlanProductLimits(plan)?.sandboxTtlMs ?? 0;
}

/** GOV-7: max connector tools admitted into one managed turn; null = uncapped. */
export function getPlanMaxConnectorTools(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxConnectorTools);
}

/** GOV-7 / GOV-8: max scheduled tasks a user may own; null = uncapped. */
export function getPlanMaxScheduledTasks(plan: string | null | undefined): number | null {
  return toEnforceableBillingPlanLimit(getBillingPlanProductLimits(plan)?.maxScheduledTasks);
}

/**
 * GOV-20: the next self-serve tier above `plan`, or null when there is none
 * (already on the top self-serve tier, or on a sales-assisted tier).
 * Lets a paywall render a concrete upgrade target instead of a generic link.
 */
export function getNextUpgradeTier(plan: string | null | undefined): SelfServePaidPlanTier | null {
  const current = normalizeBillingPlanTier(plan);
  const index = (SELF_SERVE_PAID_PLAN_TIERS as readonly BillingPlanTier[]).indexOf(current);
  if (index === -1) {
    // Free / local / byok have no rank in the paid ladder: the first paid tier
    // is the upgrade. Team and Enterprise are sales-assisted — no self-serve
    // step exists above them.
    return current === 'team' || current === 'enterprise'
      ? null
      : (SELF_SERVE_PAID_PLAN_TIERS[0] ?? null);
  }
  return SELF_SERVE_PAID_PLAN_TIERS[index + 1] ?? null;
}

/**
 * GOV-20: why a managed turn was refused, and what the user can actually do.
 *
 * The chat surface previously rendered its inline paywall card for exactly
 * three free-trial literals; every PAID limit code
 * (`rolling_five_hour_limit_reached`, `rolling_weekly_limit_reached`,
 * `flagship_weekly_limit_reached`, `insufficient_credits`,
 * `monthly_limit_exceeded`, `RATE_LIMIT_EXCEEDED`) fell through to a plain
 * banner with no upgrade link and no reset time — showing the users most
 * likely to convert the only path with no way forward.
 *
 * This is the single classifier both the free-trial and paid paths use.
 */
export type ManagedQuotaBlockKind =
  | 'free_trial'
  | 'rolling_window'
  | 'billing_period'
  | 'rate_limit'
  /**
   * The plan simply does not include the capability — nothing was exhausted and
   * nothing resets. Distinct from every other kind here, which are all "you had
   * an allowance and used it up", so the card must not offer a reset time.
   */
  | 'plan_capability';

export interface ManagedQuotaBlockPresentation {
  kind: ManagedQuotaBlockKind;
  /** Which allowance was exhausted; maps onto the paywall card's feature slot. */
  feature: 'token_cap' | 'model_access' | 'paid_capability' | 'rolling_capacity' | 'request_rate';
  /** Render an upgrade call to action. */
  showUpgradeCta: boolean;
  /** Render the reset / retry-after time the response carries. */
  showResetTime: boolean;
  /** True when switching to a standard (non-flagship) model also clears it. */
  suggestStandardModel: boolean;
  /** Default copy; a server-supplied message should win when present. */
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
      reason: 'You have reached the current free usage limit. Upgrade for more hosted capacity.',
    },
    free_trial_model_only: {
      kind: 'free_trial',
      feature: 'model_access',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: true,
      reason: 'That model requires a paid plan. Choose a free model or upgrade.',
    },
    free_trial_feature_unavailable: {
      kind: 'free_trial',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      reason: 'That capability requires a paid plan.',
    },
    /**
     * Emitted by the media routes when `canUseBillingPlanCapability` refuses —
     * image generation below Pro, video generation below Max 15x.
     *
     * It was absent here, so a Free or Basic user asking for an image IN CHAT
     * fell through to a plain error banner: the exact GOV-20 failure this map
     * was built to end, except for capability refusals rather than exhausted
     * quotas. The media hook (`useMediaGeneration`) already recognised the code,
     * so the same refusal produced an upgrade card on the media surface and a
     * dead-end error in chat.
     *
     * `showResetTime` is false because nothing refills — waiting does not help,
     * and offering a reset time would be a lie. The server's message names the
     * qualifying plans, and it wins over `reason` when present.
     */
    plan_upgrade_required: {
      kind: 'plan_capability',
      feature: 'paid_capability',
      showUpgradeCta: true,
      showResetTime: false,
      suggestStandardModel: false,
      reason: 'That capability is not included in your current plan.',
    },
    rolling_five_hour_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      reason:
        'You have used your rolling 5-hour capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    rolling_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      reason:
        'You have used your rolling weekly capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
    },
    flagship_weekly_limit_reached: {
      kind: 'rolling_window',
      feature: 'rolling_capacity',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: true,
      reason:
        'You have used your weekly capacity for the most capable models. Choose a standard model, wait for capacity to refill, or upgrade.',
    },
    insufficient_credits: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_limit_exceeded: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    monthly_credit_limit_reached: {
      kind: 'billing_period',
      feature: 'token_cap',
      showUpgradeCta: true,
      showResetTime: true,
      suggestStandardModel: false,
      reason: 'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
    },
    rate_limit_exceeded: {
      kind: 'rate_limit',
      feature: 'request_rate',
      showUpgradeCta: false,
      showResetTime: true,
      suggestStandardModel: false,
      reason: 'Too many requests in a short time. Please wait a moment and try again.',
    },
  },
);

/**
 * Classify a server error code into its quota presentation, or null when the
 * code is not a quota/limit refusal. Case-insensitive: the wire carries both
 * `insufficient_credits` and `RATE_LIMIT_EXCEEDED`.
 */
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
