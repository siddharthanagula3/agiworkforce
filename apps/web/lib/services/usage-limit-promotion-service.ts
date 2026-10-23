import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_USAGE_LIMITS,
  USAGE_LIMIT_RESET_SOURCES,
  USAGE_LIMIT_UPLIFT_WINDOWS,
  creditsFromMicrousd,
  isFreeBillingPlanTier,
  microusdFromCredits,
  upliftExposure,
  upliftedCap,
  type BillingPlanTier,
  type UsageLimitPromotionState,
  type UsageLimitUpliftWindow,
} from '@agiworkforce/types';
import { z } from 'zod';

import { revenueContextOfSubscription } from '@/lib/billing/revenue-context';
import { USAGE_WORKLOADS } from '@/lib/billing/usage-attribution';
import { readFeatureFlagConfig } from '@/lib/feature-flags/flag-config';
import { readUsagePromotionsOn } from '@/lib/feature-flags/usage-promotions-gate';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  ROLLING_SESSION_WINDOW_HOURS,
  ROLLING_WEEKLY_WINDOW_HOURS,
} from '@/lib/server/capability-limit-resets';
import {
  getPlanFlagshipWeeklyUsageCapMicrousd,
  getPlanSessionUsageCapMicrousd,
  getPlanWeeklyUsageCapMicrousd,
} from '@/lib/server/managed-usage-policy';
import { resolveEntitlementBundle } from '@/lib/services/effective-subscription-service';

const PROMOTION_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const APPLY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const UPLIFT_REFERENCE = 'uplift';
const PERCENT_SCALE = 100;
const DAY_MS = 86_400_000;

export function promotablePlanTiers(): BillingPlanTier[] {
  return (Object.keys(MANAGED_USAGE_LIMITS) as BillingPlanTier[]).filter((tier) => {
    const limit = MANAGED_USAGE_LIMITS[tier];
    return (
      !isFreeBillingPlanTier(tier) &&
      !limit.unlimited &&
      limit.weeklyCredits > 0 &&
      limit.fiveHourCredits > 0
    );
  });
}

const PlanListSchema = z
  .array(z.string())
  .min(1)
  .max(16)
  .refine(
    (plans) => plans.every((plan) => promotablePlanTiers().includes(plan as BillingPlanTier)),
    {
      message: 'Every plan must be a paid plan with 5-hour and weekly limits',
    },
  )
  .refine((plans) => new Set(plans).size === plans.length, { message: 'Plans must be unique' });

const PromotionFields = {
  id: z.string().regex(PROMOTION_ID),
  description: z.string().trim().max(500).default(''),
  enabled: z
    .boolean()
    .default(false)
    .describe(
      'Turning a promotion off stops new grants, claims and applies. Held resets stay usable until their own expiry unless the promotion is disabled.',
    ),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  plans: PlanListSchema,
  costCeilingCredits: z
    .number()
    .positive()
    .max(1_000_000_000)
    .describe(
      'The most this promotion may give away. Exposure is committed at claim time as a worst case, so the ceiling fills before the real cost does.',
    ),
};

export const UsageLimitPromotionInputSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...PromotionFields,
      kind: z.literal('limit_reset'),
      resetSource: z.enum(USAGE_LIMIT_RESET_SOURCES),
      resetsPerGrant: z.number().int().min(1).max(10),
      resetValidDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .describe(
          'Days a granted reset stays usable. A held reset stays usable until its own expiry unless the promotion is disabled.',
        ),
      applyAtPercent: z.number().int().min(0).max(100),
    }),
    z.strictObject({
      ...PromotionFields,
      kind: z.literal('limit_uplift'),
      upliftPercent: z.number().int().min(1).max(1000),
      upliftWindows: z
        .array(z.enum(USAGE_LIMIT_UPLIFT_WINDOWS))
        .min(1)
        .refine((windows) => new Set(windows).size === windows.length, {
          message: 'Windows must be unique',
        }),
      upliftWorkloads: z
        .array(z.enum(USAGE_WORKLOADS))
        .default([])
        .refine((workloads) => new Set(workloads).size === workloads.length, {
          message: 'Workloads must be unique',
        }),
    }),
  ])
  .superRefine((input, context) => {
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'A promotion has to end after it starts',
      });
    }
  });

export type UsageLimitPromotionInput = z.infer<typeof UsageLimitPromotionInputSchema>;

interface PromotionBase {
  id: string;
  description: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  plans: string[];
  costCeilingMicrousd: number;
  committedMicrousd: number;
  version: number;
  updatedAt: string;
}

export interface ResetPromotion extends PromotionBase {
  kind: 'limit_reset';
  resetSource: (typeof USAGE_LIMIT_RESET_SOURCES)[number];
  resetsPerGrant: number;
  resetValidDays: number;
  applyAtPercent: number;
}

export interface UpliftPromotion extends PromotionBase {
  kind: 'limit_uplift';
  upliftPercent: number;
  upliftWindows: UsageLimitUpliftWindow[];
  upliftWorkloads: string[];
}

export type UsageLimitPromotion = ResetPromotion | UpliftPromotion;

interface PromotionRow {
  id: string;
  kind: string;
  description: string;
  enabled: boolean;
  starts_at: string | Date;
  ends_at: string | Date;
  plans: string[];
  cost_ceiling_microusd: string | number;
  committed_microusd: string | number;
  reset_source: string | null;
  resets_per_grant: number | null;
  reset_valid_days: number | null;
  apply_at_percent: number | null;
  uplift_percent: number | null;
  uplift_windows: string[];
  uplift_workloads: string[];
  version: number;
  updated_at: string | Date;
}

const PROMOTION_COLUMNS = `id, kind, description, enabled, starts_at, ends_at, plans,
  cost_ceiling_microusd, committed_microusd, reset_source, resets_per_grant,
  reset_valid_days, apply_at_percent, uplift_percent, uplift_windows, uplift_workloads,
  version, updated_at`;

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function amount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function toPromotion(row: PromotionRow): UsageLimitPromotion | null {
  const base: PromotionBase = {
    id: row.id,
    description: row.description,
    enabled: row.enabled === true,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    plans: row.plans,
    costCeilingMicrousd: amount(row.cost_ceiling_microusd),
    committedMicrousd: amount(row.committed_microusd),
    version: row.version,
    updatedAt: iso(row.updated_at),
  };
  if (
    row.kind === 'limit_reset' &&
    (USAGE_LIMIT_RESET_SOURCES as readonly string[]).includes(row.reset_source ?? '') &&
    row.resets_per_grant !== null &&
    row.reset_valid_days !== null &&
    row.apply_at_percent !== null
  ) {
    return {
      ...base,
      kind: 'limit_reset',
      resetSource: row.reset_source as ResetPromotion['resetSource'],
      resetsPerGrant: row.resets_per_grant,
      resetValidDays: row.reset_valid_days,
      applyAtPercent: row.apply_at_percent,
    };
  }
  if (
    row.kind === 'limit_uplift' &&
    row.uplift_percent !== null &&
    row.uplift_windows.length > 0 &&
    row.uplift_windows.every((window) =>
      (USAGE_LIMIT_UPLIFT_WINDOWS as readonly string[]).includes(window),
    )
  ) {
    return {
      ...base,
      kind: 'limit_uplift',
      upliftPercent: row.uplift_percent,
      upliftWindows: row.uplift_windows as UsageLimitUpliftWindow[],
      upliftWorkloads: row.uplift_workloads,
    };
  }
  logger.error({ promotionId: row.id }, '[usage-promotions] unreadable promotion row; ignored');
  return null;
}

export async function listUsageLimitPromotions(
  db: DatabaseAdapter,
  options: { enabledOnly?: boolean } = {},
): Promise<UsageLimitPromotion[]> {
  const rows = await db.query<PromotionRow>(
    `select ${PROMOTION_COLUMNS}
       from public.usage_limit_promotions
      where not $1::boolean or enabled
      order by id asc`,
    [options.enabledOnly === true],
  );
  return rows.map(toPromotion).filter((row): row is UsageLimitPromotion => row !== null);
}

const ENABLED_PROMOTIONS_CACHE_TTL_MS = readFeatureFlagConfig().definitionCacheTtlMs;

let cachedEnabledPromotions: { promotions: UsageLimitPromotion[]; expiresAtMs: number } | null =
  null;
let inFlightEnabledPromotions: Promise<UsageLimitPromotion[]> | null = null;

export function resetEnabledPromotionCache(): void {
  cachedEnabledPromotions = null;
  inFlightEnabledPromotions = null;
}

async function readEnabledPromotions(
  db: DatabaseAdapter,
  nowMs: number,
): Promise<UsageLimitPromotion[]> {
  if (cachedEnabledPromotions && cachedEnabledPromotions.expiresAtMs > nowMs) {
    return cachedEnabledPromotions.promotions;
  }
  if (!inFlightEnabledPromotions) {
    inFlightEnabledPromotions = listUsageLimitPromotions(db, { enabledOnly: true })
      .then((promotions) => {
        cachedEnabledPromotions = {
          promotions,
          expiresAtMs: nowMs + ENABLED_PROMOTIONS_CACHE_TTL_MS,
        };
        return promotions;
      })
      .finally(() => {
        inFlightEnabledPromotions = null;
      });
  }
  return inFlightEnabledPromotions;
}

export async function upsertUsageLimitPromotion(
  db: DatabaseAdapter,
  input: UsageLimitPromotionInput,
  expectedVersion: number | null,
  actorId: string,
): Promise<UsageLimitPromotion | null> {
  const reset = input.kind === 'limit_reset' ? input : null;
  const uplift = input.kind === 'limit_uplift' ? input : null;
  const params = [
    input.id,
    input.kind,
    input.description,
    input.enabled,
    input.startsAt,
    input.endsAt,
    input.plans,
    Math.round(microusdFromCredits(input.costCeilingCredits)),
    reset?.resetSource ?? null,
    reset?.resetsPerGrant ?? null,
    reset?.resetValidDays ?? null,
    reset?.applyAtPercent ?? null,
    uplift?.upliftPercent ?? null,
    uplift?.upliftWindows ?? [],
    uplift?.upliftWorkloads ?? [],
    actorId,
  ];
  const rows =
    expectedVersion === null
      ? await db.query<PromotionRow>(
          `insert into public.usage_limit_promotions (
             id, kind, description, enabled, starts_at, ends_at, plans, cost_ceiling_microusd,
             reset_source, resets_per_grant, reset_valid_days, apply_at_percent,
             uplift_percent, uplift_windows, uplift_workloads, updated_by
           ) values (
             $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::text[], $8::bigint,
             $9, $10, $11, $12, $13, $14::text[], $15::text[], $16
           )
           on conflict (id) do nothing
           returning ${PROMOTION_COLUMNS}`,
          params,
        )
      : await db.query<PromotionRow>(
          `update public.usage_limit_promotions
              set description = $3, enabled = $4, starts_at = $5::timestamptz,
                  ends_at = $6::timestamptz, plans = $7::text[], cost_ceiling_microusd = $8::bigint,
                  reset_source = $9, resets_per_grant = $10, reset_valid_days = $11,
                  apply_at_percent = $12, uplift_percent = $13, uplift_windows = $14::text[],
                  uplift_workloads = $15::text[], updated_by = $16, version = version + 1
            where id = $1 and kind = $2 and version = $17
            returning ${PROMOTION_COLUMNS}`,
          [...params, expectedVersion],
        );
  resetEnabledPromotionCache();
  const row = rows[0];
  return row ? toPromotion(row) : null;
}

const AUDITED_FIELDS = [
  'enabled',
  'costCeilingCredits',
  'startsAt',
  'endsAt',
  'plans',
  'resetSource',
  'resetsPerGrant',
  'resetValidDays',
  'applyAtPercent',
  'upliftPercent',
  'upliftWindows',
  'upliftWorkloads',
] as const;

function auditedValues(promotion: UsageLimitPromotion | null): Map<string, string> {
  const values = new Map<string, string>();
  if (!promotion) return values;
  const fields: Record<string, unknown> = {
    ...promotion,
    costCeilingCredits: creditsFromMicrousd(promotion.costCeilingMicrousd),
  };
  for (const field of AUDITED_FIELDS) {
    const value = fields[field];
    if (value === undefined || value === null) continue;
    values.set(field, Array.isArray(value) ? value.join(',') : String(value));
  }
  return values;
}

/** The configuration keys an edit changed, each with its value before and after. */
export function diffUsageLimitPromotion(
  before: UsageLimitPromotion | null,
  after: UsageLimitPromotion,
): { changedKeys: string[]; before: string[]; after: string[] } {
  const previous = auditedValues(before);
  const next = auditedValues(after);
  const changed = AUDITED_FIELDS.filter((field) => previous.get(field) !== next.get(field));
  return {
    changedKeys: [...changed],
    before: changed.flatMap((field) =>
      previous.has(field) ? [`${field}:${previous.get(field)}`] : [],
    ),
    after: changed.flatMap((field) => (next.has(field) ? [`${field}:${next.get(field)}`] : [])),
  };
}

function isLive(promotion: UsageLimitPromotion, nowMs: number): boolean {
  return (
    promotion.enabled &&
    Date.parse(promotion.startsAt) <= nowMs &&
    nowMs < Date.parse(promotion.endsAt)
  );
}

function coversPlan(promotion: UsageLimitPromotion, planTier: string): boolean {
  return promotion.plans.includes(planTier.trim().toLowerCase());
}

function coversWorkload(promotion: UpliftPromotion, workload: string | null): boolean {
  return (
    promotion.upliftWorkloads.length === 0 ||
    (workload !== null && promotion.upliftWorkloads.includes(workload))
  );
}

export interface LimitCaps {
  session: number | null;
  weekly: number | null;
  flagshipWeekly: number | null;
}

interface WindowUsage {
  session: number;
  weekly: number;
  flagshipWeekly: number;
  sessionBeforeReset: number;
  weeklyBeforeReset: number;
  flagshipWeeklyBeforeReset: number;
}

/**
 * The rolling windows as admission sums them (0347): signed deductions, past
 * overage left out unless asked for, plus the share that predates the account's
 * last reset, which the reset took out of the windows.
 */
async function readWindowUsage(
  db: DatabaseAdapter,
  userId: string,
  resetAt: string | null,
  includeOverage: boolean,
): Promise<WindowUsage> {
  const [row] = await db.query<Record<string, string | number | null>>(
    `select
       coalesce(sum(t.amount_microusd) filter (
         where t.created_at >= now() - make_interval(hours => $2)), 0)::bigint as session,
       coalesce(sum(t.amount_microusd), 0)::bigint as weekly,
       coalesce(sum(t.amount_microusd) filter (
         where t.metadata->>'is_flagship' = 'true'), 0)::bigint as flagship_weekly,
       coalesce(sum(t.amount_microusd) filter (
         where t.created_at >= now() - make_interval(hours => $2)
           and t.created_at < $4::timestamptz), 0)::bigint as session_before,
       coalesce(sum(t.amount_microusd) filter (
         where t.created_at < $4::timestamptz), 0)::bigint as weekly_before,
       coalesce(sum(t.amount_microusd) filter (
         where t.metadata->>'is_flagship' = 'true'
           and t.created_at < $4::timestamptz), 0)::bigint as flagship_weekly_before
     from public.credit_transactions t
     where t.user_id = $1
       and t.transaction_type = 'deduction'
       and t.created_at >= now() - make_interval(hours => $3)
       and ($5::boolean or t.metadata->>'is_overage' is distinct from 'true')`,
    [userId, ROLLING_SESSION_WINDOW_HOURS, ROLLING_WEEKLY_WINDOW_HOURS, resetAt, includeOverage],
  );
  const positive = (key: string) => Math.max(0, amount(row?.[key]));
  return {
    session: positive('session'),
    weekly: positive('weekly'),
    flagshipWeekly: positive('flagship_weekly'),
    sessionBeforeReset: positive('session_before'),
    weeklyBeforeReset: positive('weekly_before'),
    flagshipWeeklyBeforeReset: positive('flagship_weekly_before'),
  };
}

function sinceReset(usage: WindowUsage): { session: number; weekly: number; flagship: number } {
  return {
    session: Math.max(0, usage.session - usage.sessionBeforeReset),
    weekly: Math.max(0, usage.weekly - usage.weeklyBeforeReset),
    flagship: Math.max(0, usage.flagshipWeekly - usage.flagshipWeeklyBeforeReset),
  };
}

interface GrantRow {
  id: string;
  promotion_id: string;
  kind: string;
  reference_id: string;
  expires_at: string | Date;
  applied_at: string | Date | null;
  committed_microusd: string | number | null;
}

interface UpliftClaim {
  expiresAt: string;
  committedMicrousd: number;
}

interface AccountGrants {
  available: { id: string; promotionId: string; expiresAt: string }[];
  lastResetAt: string | null;
  claimedUplifts: Map<string, UpliftClaim>;
}

async function readAccountGrants(db: DatabaseAdapter, userId: string): Promise<AccountGrants> {
  const rows = await db.query<GrantRow>(
    `select g.id, g.promotion_id, p.kind, g.reference_id, g.expires_at, g.applied_at,
            g.committed_microusd
       from public.usage_limit_promotion_grants g
       join public.usage_limit_promotions p on p.id = g.promotion_id
      where g.user_id = $1
        and (g.expires_at > now() or g.applied_at > now() - make_interval(hours => $2))
      order by g.expires_at asc, g.id asc`,
    [userId, ROLLING_WEEKLY_WINDOW_HOURS],
  );
  const grants: AccountGrants = { available: [], lastResetAt: null, claimedUplifts: new Map() };
  const nowMs = Date.now();
  for (const row of rows) {
    if (row.kind === 'limit_uplift') {
      if (Date.parse(iso(row.expires_at)) > nowMs) {
        grants.claimedUplifts.set(row.promotion_id, {
          expiresAt: iso(row.expires_at),
          committedMicrousd: amount(row.committed_microusd),
        });
      }
      continue;
    }
    if (row.applied_at === null) {
      grants.available.push({
        id: row.id,
        promotionId: row.promotion_id,
        expiresAt: iso(row.expires_at),
      });
    } else if (grants.lastResetAt === null || iso(row.applied_at) > grants.lastResetAt) {
      grants.lastResetAt = iso(row.applied_at);
    }
  }
  return grants;
}

/** Issues the resets a live promotion owes this account. Idempotent per promotion and slot. */
export async function ensurePromotionResetGrants(
  db: DatabaseAdapter,
  userId: string,
  planTier: string,
  promotions: readonly UsageLimitPromotion[],
  nowMs: number = Date.now(),
): Promise<number> {
  let issued = 0;
  for (const promotion of promotions) {
    if (
      promotion.kind !== 'limit_reset' ||
      promotion.resetSource !== 'promotion' ||
      !isLive(promotion, nowMs) ||
      !coversPlan(promotion, planTier)
    ) {
      continue;
    }
    issued += await insertResetGrants(db, userId, promotion, 'promotion', nowMs);
  }
  return issued;
}

async function insertResetGrants(
  db: DatabaseAdapter,
  userId: string,
  promotion: ResetPromotion,
  referencePrefix: string,
  nowMs: number,
): Promise<number> {
  const expiresAt = new Date(nowMs + promotion.resetValidDays * DAY_MS).toISOString();
  const rows = await db.query<{ id: string }>(
    `insert into public.usage_limit_promotion_grants
       (promotion_id, user_id, reference_id, granted_at, expires_at)
     select $1, $2, $3 || ':' || slot, now(), $5::timestamptz
       from generate_series(1, $4::integer) as slot
     on conflict (promotion_id, user_id, reference_id) do nothing
     returning id`,
    [promotion.id, userId, referencePrefix, promotion.resetsPerGrant, expiresAt],
  );
  return rows.length;
}

/** Grants the resets a live referral promotion gives the referrer of a rewarded referral. */
export async function grantReferralResets(
  db: DatabaseAdapter,
  input: { userId: string; planTier: string; referralId: string },
  nowMs: number = Date.now(),
): Promise<number> {
  if (!(await readUsagePromotionsOn(input.userId, input.planTier, nowMs))) return 0;
  const promotions = await listUsageLimitPromotions(db, { enabledOnly: true });
  let issued = 0;
  for (const promotion of promotions) {
    if (
      promotion.kind !== 'limit_reset' ||
      promotion.resetSource !== 'referral' ||
      !isLive(promotion, nowMs) ||
      !coversPlan(promotion, input.planTier)
    ) {
      continue;
    }
    issued += await insertResetGrants(
      db,
      input.userId,
      promotion,
      `referral:${input.referralId}`,
      nowMs,
    );
  }
  return issued;
}

class CeilingReached extends Error {}

/** What a claim must still commit: null when the claim already covers the promotion as it stands. */
function recostOf(
  claim: UpliftClaim | undefined,
  promotion: UpliftPromotion,
  exposureMicrousd: number,
): number | null {
  if (!claim) return exposureMicrousd;
  const covers =
    Date.parse(claim.expiresAt) >= Date.parse(promotion.endsAt) &&
    claim.committedMicrousd >= exposureMicrousd;
  return covers ? null : exposureMicrousd;
}

function upliftHeldOrFunded(
  claim: UpliftClaim | undefined,
  promotion: UpliftPromotion,
  exposureMicrousd: number,
): boolean {
  const additional = recostOf(claim, promotion, exposureMicrousd);
  return additional === null || fitsCeiling(promotion, additional);
}

function fitsCeiling(promotion: UpliftPromotion, additionalMicrousd: number): boolean {
  return promotion.committedMicrousd + additionalMicrousd <= promotion.costCeilingMicrousd;
}

/**
 * Claims an uplift for an account, or re-costs a claim the promotion has
 * outgrown, if the promotion's ceiling still covers the most it can add. A
 * claim whose expiry predates the promotion's end, or whose commitment is
 * below the exposure at the promotion's current terms, is extended and charged
 * the full current exposure again under the same row lock. That over-counts what
 * the earlier commitment already covered, which keeps the ceiling above the true
 * worst case after any edit.
 */
async function claimUplift(
  db: DatabaseAdapter,
  userId: string,
  promotion: UpliftPromotion,
  exposureMicrousd: number,
): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx.query<{
        committed_microusd: string | number;
        cost_ceiling_microusd: string | number;
        version: number;
        live: boolean;
      }>(
        `select committed_microusd, cost_ceiling_microusd, version,
                (enabled and starts_at <= now() and now() < ends_at) as live
           from public.usage_limit_promotions
          where id = $1 and kind = 'limit_uplift'
          for update`,
        [promotion.id],
      );
      if (!locked?.live || locked.version !== promotion.version) return false;
      const [existing] = await tx.query<{
        committed_microusd: string | number | null;
        lapsed: boolean;
        ends_short: boolean;
      }>(
        `select g.committed_microusd, g.expires_at <= now() as lapsed,
                g.expires_at < p.ends_at as ends_short
           from public.usage_limit_promotion_grants g
           join public.usage_limit_promotions p on p.id = g.promotion_id
          where g.promotion_id = $1 and g.user_id = $2 and g.reference_id = $3`,
        [promotion.id, userId, UPLIFT_REFERENCE],
      );
      const covered =
        existing !== undefined &&
        !existing.lapsed &&
        !existing.ends_short &&
        amount(existing.committed_microusd) >= exposureMicrousd;
      if (covered) return true;
      const additional = exposureMicrousd;
      if (amount(locked.committed_microusd) + additional > amount(locked.cost_ceiling_microusd)) {
        throw new CeilingReached();
      }
      if (existing) {
        await tx.execute(
          `update public.usage_limit_promotion_grants g
              set expires_at = greatest(g.expires_at, p.ends_at),
                  committed_microusd = coalesce(g.committed_microusd, 0) + $4::bigint
             from public.usage_limit_promotions p
            where p.id = g.promotion_id
              and g.promotion_id = $1 and g.user_id = $2 and g.reference_id = $3`,
          [promotion.id, userId, UPLIFT_REFERENCE, additional],
        );
      } else {
        await tx.execute(
          `insert into public.usage_limit_promotion_grants
             (promotion_id, user_id, reference_id, granted_at, expires_at, applied_at,
              committed_microusd)
           select $1, $2, $3, now(), ends_at, now(), $4::bigint
             from public.usage_limit_promotions where id = $1`,
          [promotion.id, userId, UPLIFT_REFERENCE, additional],
        );
      }
      if (additional > 0) {
        await tx.execute(
          `update public.usage_limit_promotions
              set committed_microusd = committed_microusd + $2::bigint
            where id = $1`,
          [promotion.id, additional],
        );
      }
      return true;
    });
  } catch (error) {
    if (error instanceof CeilingReached) {
      logger.info({ promotionId: promotion.id }, '[usage-promotions] uplift ceiling reached');
      return false;
    }
    throw error;
  }
}

function exposureOf(promotion: UpliftPromotion, base: LimitCaps, nowMs: number): number {
  return upliftExposure({
    sessionCap: base.session,
    weeklyCap: base.weekly,
    percent: promotion.upliftPercent,
    windows: promotion.upliftWindows,
    remainingMs: Date.parse(promotion.endsAt) - nowMs,
    sessionWindowHours: ROLLING_SESSION_WINDOW_HOURS,
    weeklyWindowHours: ROLLING_WEEKLY_WINDOW_HOURS,
  });
}

function strongestPercent(
  promotions: readonly UpliftPromotion[],
  window: UsageLimitUpliftWindow,
): number {
  return promotions.reduce(
    (best, promotion) =>
      promotion.upliftWindows.includes(window) ? Math.max(best, promotion.upliftPercent) : best,
    0,
  );
}

function raise(cap: number | null, percent: number, refreshed: number): number | null {
  const raised = upliftedCap(cap, percent);
  return raised === null ? null : raised + refreshed;
}

/**
 * The caps admission enforces once this account's promotions are counted: an
 * uplift it has claimed raises its windows, and a reset applied in the last
 * week adds back the usage that predates it. An uplift is claimed only when
 * the request would otherwise pass the plan's own cap. Any failure leaves the
 * plan's caps, because the other answer gives usage away unchecked.
 */
export async function resolvePromotionalCaps(
  input: {
    userId: string;
    planTier: string;
    workload: string | null;
    estimateMicrousd: number;
    isFlagship: boolean;
    caps: LimitCaps;
  },
  nowMs: number = Date.now(),
  connect: () => DatabaseAdapter = getNeonDb,
): Promise<LimitCaps> {
  const base = input.caps;
  if (base.session === null && base.weekly === null) return base;
  if (!(await readUsagePromotionsOn(input.userId, input.planTier, nowMs))) return base;
  try {
    const db = connect();
    const [promotions, grants] = await Promise.all([
      readEnabledPromotions(db, nowMs),
      readAccountGrants(db, input.userId),
    ]);
    const uplifts = promotions.filter(
      (promotion): promotion is UpliftPromotion =>
        promotion.kind === 'limit_uplift' &&
        isLive(promotion, nowMs) &&
        coversPlan(promotion, input.planTier) &&
        coversWorkload(promotion, input.workload),
    );
    const claimed: UpliftPromotion[] = [];
    for (const promotion of uplifts) {
      const claim = grants.claimedUplifts.get(promotion.id);
      if (!claim) continue;
      const exposure = exposureOf(promotion, base, nowMs);
      const additional = recostOf(claim, promotion, exposure);
      if (additional === null) {
        claimed.push(promotion);
      } else if (
        fitsCeiling(promotion, additional) &&
        (await claimUplift(db, input.userId, promotion, exposure))
      ) {
        claimed.push(promotion);
      }
    }
    const unclaimed = uplifts
      .filter((promotion) => !grants.claimedUplifts.has(promotion.id))
      .sort((left, right) => right.upliftPercent - left.upliftPercent);
    if (unclaimed.length === 0 && grants.lastResetAt === null) {
      return applyUplifts(base, claimed, null);
    }

    const usage = await readWindowUsage(db, input.userId, grants.lastResetAt, false);
    const used = sinceReset(usage);
    const passes = (window: UsageLimitUpliftWindow) => {
      const cap = window === 'session' ? base.session : base.weekly;
      const spent = window === 'session' ? used.session : used.weekly;
      return cap !== null && spent + input.estimateMicrousd > cap;
    };
    const flagshipPasses =
      input.isFlagship &&
      base.flagshipWeekly !== null &&
      used.flagship + input.estimateMicrousd > base.flagshipWeekly;
    for (const promotion of unclaimed) {
      const needed =
        promotion.upliftWindows.some(passes) ||
        (promotion.upliftWindows.includes('weekly') && flagshipPasses);
      if (!needed) continue;
      const exposure = exposureOf(promotion, base, nowMs);
      if (!fitsCeiling(promotion, exposure)) continue;
      if (await claimUplift(db, input.userId, promotion, exposure)) {
        claimed.push(promotion);
        break;
      }
    }
    return applyUplifts(base, claimed, grants.lastResetAt === null ? null : usage);
  } catch (error) {
    logger.error(
      { error, userId: input.userId },
      '[usage-promotions] promotions unreadable at admission; the plan caps apply',
    );
    return base;
  }
}

function applyUplifts(
  base: LimitCaps,
  claimed: readonly UpliftPromotion[],
  reset: WindowUsage | null,
): LimitCaps {
  const sessionPercent = strongestPercent(claimed, 'session');
  const weeklyPercent = strongestPercent(claimed, 'weekly');
  return {
    session: raise(base.session, sessionPercent, reset?.sessionBeforeReset ?? 0),
    weekly: raise(base.weekly, weeklyPercent, reset?.weeklyBeforeReset ?? 0),
    flagshipWeekly: raise(
      base.flagshipWeekly,
      weeklyPercent,
      reset?.flagshipWeeklyBeforeReset ?? 0,
    ),
  };
}

export interface SummaryPromotions {
  state: UsageLimitPromotionState;
  /** Usage before the last reset, as the summary's own window sums count it. */
  refreshed: { session: number; weekly: number; flagshipWeekly: number };
  /** Uplift the summary's meters show: only an uplift on every workload the account holds or may claim. */
  upliftPercent: { session: number; weekly: number };
}

function percentOf(used: number, cap: number | null): number {
  return cap === null || cap <= 0 ? 0 : (used / cap) * PERCENT_SCALE;
}

function canApply(
  promotion: ResetPromotion | undefined,
  used: { session: number; weekly: number },
  caps: LimitCaps,
): boolean {
  if (!promotion) return false;
  const nearest = Math.max(
    percentOf(used.session, caps.session),
    percentOf(used.weekly, caps.weekly),
  );
  return nearest >= promotion.applyAtPercent;
}

/** What the usage summary shows for promotions, or null while they are switched off. */
export async function readSummaryPromotions(
  input: { userId: string; planTier: string; caps: LimitCaps },
  nowMs: number = Date.now(),
  connect: () => DatabaseAdapter = getNeonDb,
): Promise<SummaryPromotions | null> {
  if (input.caps.session === null && input.caps.weekly === null) return null;
  if (!(await readUsagePromotionsOn(input.userId, input.planTier, nowMs))) return null;
  try {
    const db = connect();
    const promotions = await readEnabledPromotions(db, nowMs);
    await ensurePromotionResetGrants(db, input.userId, input.planTier, promotions, nowMs);
    const grants = await readAccountGrants(db, input.userId);
    const byId = new Map(promotions.map((promotion) => [promotion.id, promotion]));
    const usable = grants.available.filter((grant) => {
      const promotion = byId.get(grant.promotionId);
      return promotion?.kind === 'limit_reset' && coversPlan(promotion, input.planTier);
    });
    const [enforced, displayed] = await Promise.all([
      readWindowUsage(db, input.userId, grants.lastResetAt, false),
      grants.lastResetAt === null
        ? Promise.resolve(null)
        : readWindowUsage(db, input.userId, grants.lastResetAt, true),
    ]);
    const next = usable[0] ? byId.get(usable[0].promotionId) : undefined;
    const uplifts = promotions.filter(
      (promotion): promotion is UpliftPromotion =>
        promotion.kind === 'limit_uplift' &&
        isLive(promotion, nowMs) &&
        coversPlan(promotion, input.planTier) &&
        upliftHeldOrFunded(
          grants.claimedUplifts.get(promotion.id),
          promotion,
          exposureOf(promotion, input.caps, nowMs),
        ),
    );
    const everyWorkload = uplifts.filter((promotion) => promotion.upliftWorkloads.length === 0);
    return {
      state: {
        resets: {
          available: usable.length,
          grants: usable.map((grant) => ({ grant_id: grant.id, expires_at: grant.expiresAt })),
          can_apply: canApply(
            next?.kind === 'limit_reset' ? next : undefined,
            sinceReset(enforced),
            input.caps,
          ),
          last_applied_at: grants.lastResetAt,
        },
        uplifts: uplifts.map((promotion) => ({
          promotion_id: promotion.id,
          percent: promotion.upliftPercent,
          windows: [...promotion.upliftWindows],
          workloads: [...promotion.upliftWorkloads],
          ends_at: promotion.endsAt,
        })),
      },
      refreshed: {
        session: displayed?.sessionBeforeReset ?? 0,
        weekly: displayed?.weeklyBeforeReset ?? 0,
        flagshipWeekly: displayed?.flagshipWeeklyBeforeReset ?? 0,
      },
      upliftPercent: {
        session: strongestPercent(everyWorkload, 'session'),
        weekly: strongestPercent(everyWorkload, 'weekly'),
      },
    };
  } catch (error) {
    logger.error(
      { error, userId: input.userId },
      '[usage-promotions] promotions unreadable for the usage summary; none shown',
    );
    return null;
  }
}

export type ApplyResetRefusal =
  'promotions_off' | 'no_reset' | 'not_near_limit' | 'ceiling_reached' | 'uncapped';

export type ApplyResetOutcome =
  | {
      status: 'applied' | 'already_applied';
      grantId: string;
      promotionId: string;
      appliedAt: string;
      refreshedCredits: number;
    }
  | { status: 'refused'; reason: ApplyResetRefusal };

export function isApplyKey(value: string | null): value is string {
  return value !== null && APPLY_KEY.test(value);
}

interface AppliedRow {
  id: string;
  promotion_id: string;
  applied_at: string | Date;
  committed_microusd: string | number;
}

function appliedOutcome(row: AppliedRow, status: 'applied' | 'already_applied'): ApplyResetOutcome {
  return {
    status,
    grantId: row.id,
    promotionId: row.promotion_id,
    appliedAt: iso(row.applied_at),
    refreshedCredits: creditsFromMicrousd(amount(row.committed_microusd)),
  };
}

/**
 * Uses one banked reset: the account's 5-hour and weekly windows restart now.
 * One key applies at most one reset, the reset's promotion must still be on
 * and cover the account's plan, the account must be at or near a limit, and
 * what the reset refreshes is committed against the promotion's ceiling in
 * the same transaction that marks the reset used.
 */
export async function applyUsageLimitReset(
  db: DatabaseAdapter,
  input: {
    userId: string;
    planTier: string;
    applyKey: string;
    grantId: string | null;
    caps: LimitCaps;
  },
  nowMs: number = Date.now(),
): Promise<ApplyResetOutcome> {
  if (!(await readUsagePromotionsOn(input.userId, input.planTier, nowMs))) {
    return { status: 'refused', reason: 'promotions_off' };
  }
  if (input.caps.session === null || input.caps.weekly === null) {
    return { status: 'refused', reason: 'uncapped' };
  }
  const promotions = await listUsageLimitPromotions(db, { enabledOnly: true });
  await ensurePromotionResetGrants(db, input.userId, input.planTier, promotions, nowMs);
  const planTier = input.planTier.trim().toLowerCase();

  return db.transaction<ApplyResetOutcome>(async (tx) => {
    await tx.execute('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `usage-limit-reset:${input.userId}`,
    ]);
    const [replayed] = await tx.query<AppliedRow>(
      `select id, promotion_id, applied_at, committed_microusd
         from public.usage_limit_promotion_grants
        where user_id = $1 and apply_key = $2 and applied_at is not null`,
      [input.userId, input.applyKey],
    );
    if (replayed) return appliedOutcome(replayed, 'already_applied');

    const [grant] = await tx.query<{
      id: string;
      promotion_id: string;
      apply_at_percent: number;
    }>(
      `select g.id, g.promotion_id, p.apply_at_percent
         from public.usage_limit_promotion_grants g
         join public.usage_limit_promotions p on p.id = g.promotion_id
        where g.user_id = $1
          and g.applied_at is null
          and g.expires_at > now()
          and p.kind = 'limit_reset'
          and p.enabled
          and $2 = any(p.plans)
          and ($3::uuid is null or g.id = $3::uuid)
        order by g.expires_at asc, g.id asc
        limit 1
        for update of g`,
      [input.userId, planTier, input.grantId],
    );
    if (!grant) return { status: 'refused', reason: 'no_reset' };

    const [lastReset] = await tx.query<{ applied_at: string | Date | null }>(
      `select max(g.applied_at) as applied_at
         from public.usage_limit_promotion_grants g
         join public.usage_limit_promotions p on p.id = g.promotion_id
        where g.user_id = $1 and p.kind = 'limit_reset'
          and g.applied_at > now() - make_interval(hours => $2)`,
      [input.userId, ROLLING_WEEKLY_WINDOW_HOURS],
    );
    const used = sinceReset(
      await readWindowUsage(
        tx,
        input.userId,
        lastReset?.applied_at ? iso(lastReset.applied_at) : null,
        false,
      ),
    );
    const nearest = Math.max(
      percentOf(used.session, input.caps.session),
      percentOf(used.weekly, input.caps.weekly),
    );
    if (nearest < grant.apply_at_percent) {
      return { status: 'refused', reason: 'not_near_limit' };
    }

    const refreshed = Math.max(used.session, used.weekly);
    const [committed] = await tx.query<{ id: string }>(
      `update public.usage_limit_promotions
          set committed_microusd = committed_microusd + $2::bigint
        where id = $1 and committed_microusd + $2::bigint <= cost_ceiling_microusd
        returning id`,
      [grant.promotion_id, refreshed],
    );
    if (!committed) return { status: 'refused', reason: 'ceiling_reached' };

    const [applied] = await tx.query<AppliedRow>(
      `update public.usage_limit_promotion_grants
          set applied_at = now(), apply_key = $3, committed_microusd = $4::bigint
        where id = $1 and user_id = $2 and applied_at is null
        returning id, promotion_id, applied_at, committed_microusd`,
      [grant.id, input.userId, input.applyKey, refreshed],
    );
    if (!applied) throw new Error('The reset was used while it was being applied');
    return appliedOutcome(applied, 'applied');
  });
}

/** The account's plan and the caps its windows are held to, as the usage summary reads them. */
export async function readAccountLimitCaps(
  db: DatabaseAdapter,
  userId: string,
): Promise<{ planTier: string; caps: LimitCaps }> {
  const subscription = (await resolveEntitlementBundle(db, userId)).subscription;
  const planTier = subscription?.plan_tier || 'free';
  const subject = {
    tier: planTier,
    catalogVersion: subscription?.plan_catalog_version ?? null,
    revenueContext: revenueContextOfSubscription(subscription),
  };
  return {
    planTier,
    caps: {
      session: getPlanSessionUsageCapMicrousd(subject),
      weekly: getPlanWeeklyUsageCapMicrousd(subject),
      flagshipWeekly: getPlanFlagshipWeeklyUsageCapMicrousd(subject),
    },
  };
}

/** Grants a rewarded referral's referrer the resets a live referral promotion gives. */
export async function grantReferralResetsToReferrer(
  db: DatabaseAdapter,
  input: { referrerId: string; referralId: string },
  nowMs: number = Date.now(),
): Promise<number> {
  const { planTier } = await readAccountLimitCaps(db, input.referrerId);
  return grantReferralResets(
    db,
    { userId: input.referrerId, planTier, referralId: input.referralId },
    nowMs,
  );
}
