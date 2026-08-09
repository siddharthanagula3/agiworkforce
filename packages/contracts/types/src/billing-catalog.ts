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
 *
 * Team joined this set once organization ownership, licensed seats, and member
 * lifecycle became real (founder decision 2026-08-04). It is billed PER SEAT:
 * `BILLING_PLAN_PRICING.team.perSeat` is true and every checkout/upgrade call
 * for Team MUST carry an explicit seat quantity. Enterprise stays sales-assisted
 * because its price is negotiated, not published.
 *
 * This is a SET, not an ordering. Team is an organization plan bought by the
 * seat, so it has no position on the individual upgrade ladder — use
 * `SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER` for anything that means "the next plan
 * up". Ranking Team against Pro/Max here would tell an individual their next
 * step is a per-seat org plan, or tell a Team admin that Max is a downgrade.
 */
export const SELF_SERVE_PAID_PLAN_TIERS = [
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
] as const satisfies readonly BillingPlanTier[];
export type SelfServePaidPlanTier = (typeof SELF_SERVE_PAID_PLAN_TIERS)[number];

/**
 * The ordered ladder of INDIVIDUAL self-serve plans, lowest to highest.
 *
 * Deliberately excludes Team: Team is per-seat and organization-scoped, so
 * "the next plan up from Pro" is Max, not Team, and "buy more seats" is not a
 * rung on this ladder. Keep every index/rank comparison on this array and keep
 * `SELF_SERVE_PAID_PLAN_TIERS` as the purchasable SET.
 */
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

/** Whether `value` has a rank on the individual upgrade ladder (Team does not). */
export function isSelfServeIndividualPlanTier(
  value: string | null | undefined,
): value is SelfServeIndividualPlanTier {
  return (
    typeof value === 'string' &&
    (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).includes(value)
  );
}

/**
 * Whether a one-click INDIVIDUAL upgrade still exists for this tier — i.e.
 * whether a generic "Upgrade" affordance should be offered at all.
 *
 * False for `max_15x` (top of the individual ladder, nothing above it to buy),
 * for `enterprise` (negotiated, not purchasable), and for `team`. Team is now
 * self-serve, but its only "more" is MORE SEATS, which the generic upgrade
 * affordance cannot express — it opens the individual plan dialog, which has no
 * seat control and would silently re-bill an org at one seat. Seat count is
 * changed from organization billing, so answering `true` here would hand a Team
 * admin a control that does the wrong thing.
 *
 * Derived from `getNextUpgradeTier` so the affordance and the concrete target
 * can never disagree.
 *
 * Shared rather than inlined per surface so web, desktop and mobile cannot
 * drift on who is shown an upgrade prompt.
 */
export function hasSelfServeUpgradePath(value: string | null | undefined): boolean {
  return getNextUpgradeTier(value) !== null;
}

export interface BillingPlanPricing {
  id: BillingPlanTier;
  label: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  /** India-specific monthly price in INR, when it differs from a straight USD conversion. */
  monthlyPriceInr?: number;
  /**
   * True when the published price is PER SEAT rather than per account. Every
   * price-rendering surface must say "/seat" and every checkout must send a
   * quantity; a bare `monthlyPriceUsd` on a per-seat plan would otherwise read
   * as the whole org's bill.
   */
  perSeat?: boolean;
}

/** Whether `plan` is billed per seat (quantity-aware checkout is mandatory). */
export function isPerSeatBillingPlan(plan: string | null | undefined): boolean {
  return BILLING_PLAN_PRICING[normalizeBillingPlanTier(plan)].perSeat === true;
}

/**
 * Seat-quantity bounds for per-seat checkout.
 *
 * The floor is 2 (founder decision, 2026-08-08): Team prices the organization
 * layer — central billing, seat management, member lifecycle — over an
 * allowance identical to Pro's, so a single-seat Team was $5/mo for company
 * scaffolding one person cannot use. One person belongs on Pro. This also
 * matches the comparables, which both require more than one seat.
 *
 * A team that shrinks to one person therefore cannot reduce to a single seat;
 * it moves to Pro instead. Team only became self-serve on 2026-08-04, so the
 * population this strands is small, but it is not nil.
 *
 * The ceiling is Stripe's documented maximum quantity for a subscription line
 * item — an API bound, NOT a product claim about team size, so an unvalidated
 * client integer cannot reach Stripe.
 */
export const MIN_PURCHASABLE_SEATS = 2;
export const MAX_PURCHASABLE_SEATS = 999_999;

/** Clamp/validate a requested seat count; returns null when it is not a usable quantity. */
export function normalizePurchasableSeats(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < MIN_PURCHASABLE_SEATS || value > MAX_PURCHASABLE_SEATS) return null;
  return value;
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
    // PER SEAT. $25/seat/mo and $240/seat/yr (founder decision 2026-08-05,
    // Decision #22, superseding the 2026-08-04 Pro-pinned $20): a Team seat
    // carries exactly Pro's managed-usage allowance
    // (apps/web/lib/server/managed-usage-policy.ts keeps the `team` budget
    // byte-identical to `pro`) — the $5-over-Pro premium prices the
    // organization layer (central billing, seat management, member lifecycle),
    // not extra allowance. Yearly USD is now wired end-to-end; live checkout
    // still needs the founder to create the $240/seat/yr Stripe Price behind
    // STRIPE_PRICE_TEAM_YEARLY_USD (absent env → yearly fails closed). Team INR
    // (monthly and yearly) is founder-undecided; ₹1,999 remains the configured
    // monthly amount and there is no INR yearly Price.
    //
    // monthlyPriceUsd MUST equal the unit_amount of the Stripe Price behind
    // STRIPE_PRICE_TEAM_MONTHLY_USD (and the INR Price behind
    // STRIPE_PRICE_TEAM_MONTHLY_INR); yearlyPriceUsd MUST equal the
    // STRIPE_PRICE_TEAM_YEARLY_USD Price. getPriceSelectionForCurrency compares
    // each and refuses checkout on a mismatch, so a drift fails closed rather
    // than charging an amount the customer did not see.
    monthlyPriceUsd: 25,
    yearlyPriceUsd: 240,
    monthlyPriceInr: 1999,
    perSeat: true,
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

/**
 * Scheduled runs one `/api/cron/run-schedules` invocation attempts, platform-wide.
 *
 * The sweep drains in waves of ten claims (the concurrency ceiling of
 * `processDueScheduleRuns`) until this many rows are attempted or the serverless
 * budget runs out, so this number times the deployed cron cadence is the total
 * daily throughput every tier's `maxScheduledTasks` shares. It lives here rather
 * than in the route because the quotas below are what it bounds, and separating
 * the two is what let them drift an order of magnitude apart.
 *
 * A sweep whose waves each burn their full per-task timeout stops early; the
 * unclaimed rows stay due and are picked up FIFO by the next sweep. Turning this
 * ceiling into a floor needs either more invocations per day (a paid cron
 * cadence) or invocation chaining — until then, size quotas against it, not above.
 */
export const PLATFORM_SCHEDULE_RUNS_PER_SWEEP = 50;

export interface BillingPlanProductLimits {
  projects: BillingPlanLimit;
  customMcpServers: BillingPlanLimit;
  /**
   * Total bytes of project knowledge files a user may hold across all
   * projects. Enforced in `apps/web/lib/services/project-context-service.ts`.
   *
   * Only a per-file byte cap and a 20-files-per-project count cap existed, so
   * a user could hold unbounded total storage by spreading large files across
   * projects — the cost dimension nobody was bounding. `local-only` / `byok`
   * store nothing on the platform and stay uncapped.
   */
  knowledgeStorageBytes: BillingPlanLimit;
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
   *
   * These values are ALSO bounded by what the platform can actually execute, and
   * that is the tighter constraint. Due schedules run only when
   * `/api/cron/run-schedules` fires (`vercel.json`), and each invocation attempts
   * at most `PLATFORM_SCHEDULE_RUNS_PER_SWEEP` rows — a bound set by Vercel's
   * `maxDuration`, not by choice. Total daily throughput is therefore
   * `invocations/day * PLATFORM_SCHEDULE_RUNS_PER_SWEEP`, shared across ALL users.
   *
   * Sizing these above that ceiling does not fail loudly: unclaimed rows stay due
   * and are picked up FIFO, so the symptom is a silently growing backlog and runs
   * landing days late. That is exactly what happened — these were sized for an
   * hourly sweep that was never deployed, against a daily cron that ran one
   * ten-row batch. `schedule-cadence.test.ts` now derives the ceiling from
   * `vercel.json` and fails when the sum of these quotas exceeds it, so the two
   * cannot drift apart again. If the cadence changes, also update
   * `SWEEP_INTERVAL_MS` in `apps/web/lib/schedules/schedule-time.ts`, which the
   * same test pins to `vercel.json`.
   */
  maxScheduledTasks: BillingPlanLimit;
}

/** Public, enforceable product limits; private usage budgets live separately. */
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
  // Free is metered in the separate free-trial micro-USD ledger and never
  // draws on the paid cents ledger, so the two dimensions that spend from that
  // ledger — managed sandboxes and unattended scheduled runs — are 0 (deny)
  // rather than a token allowance that would 402 on first use.
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
 * GOV-20: the next INDIVIDUAL self-serve tier above `plan`, or null when there
 * is none. Lets a paywall render a concrete upgrade target instead of a generic
 * link.
 *
 * Ranks against `SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER`, not against the
 * purchasable set: Team is self-serve but per-seat and organization-scoped, so
 * it is neither a step above Pro nor a plan with an individual step above it.
 * A Team admin who wants "more" buys more seats, which is a different control.
 */
export function getNextUpgradeTier(
  plan: string | null | undefined,
): SelfServeIndividualPlanTier | null {
  const current = normalizeBillingPlanTier(plan);
  const index = (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly BillingPlanTier[]).indexOf(
    current,
  );
  if (index === -1) {
    // Free / local / byok have no rank on the ladder: the first paid tier is the
    // upgrade. Team is per-seat (see above) and Enterprise is negotiated — no
    // individual self-serve step exists above either.
    return current === 'team' || current === 'enterprise'
      ? null
      : (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[0] ?? null);
  }
  return SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[index + 1] ?? null;
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
