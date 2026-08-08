import 'server-only';

/**
 * The usage-ceiling policy moved to `@agiworkforce/types` on 2026-08-08.
 *
 * It sat behind `import 'server-only'`, which made it unreachable from
 * `services/api-gateway` — so the gateway reserved with NO rolling ceilings and
 * every developer surface (desktop, CLI, VS Code) enforced no five-hour, weekly
 * or flagship limit. One definition, both surfaces, is the fix.
 *
 * Everything is re-exported here so existing imports from this module keep
 * working unchanged.
 */
export {
  MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS,
  toPublicUsagePercentage,
  getPlanMonthlyUsageUnits,
  getPlanWeeklyUsageUnits,
  getPlanDailyUsageUnits,
  getPlanFiveHourUsageUnits,
  getPlanMonthlyUsageBudgetMicrousd,
  getPlanWeeklyUsageBudgetMicrousd,
  getPlanFiveHourUsageBudgetMicrousd,
  getInternalUsageUnitMicrousd,
  isPlanUsageUncapped,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
  getPlanSessionUsageBudgetCents,
  getPlanFlagshipWeeklyUsageBudgetCents,
  getPlanSessionUsageCapCents,
  getPlanWeeklyUsageCapCents,
  getPlanFlagshipWeeklyUsageCapCents,
} from '@agiworkforce/types';
export type { ManagedUsageCapCents } from '@agiworkforce/types';

import {
  getPlanWeeklyUsageBudgetCents,
  getPlanSessionUsageBudgetCents,
  isPlanUsageUncapped,
  toPublicUsagePercentage,
} from '@agiworkforce/types';

/* ────────────────────────────────────────────────────────────────────────────
 * GOV-18: the `X-Quota-Warning` producer.
 *
 * `request-processor.ts` declared `const quotaWarningHeader: string | null =
 * null;` — a hardcoded null — while three sites emitted `X-Quota-Warning` from
 * it, so the PRE-limit warning could never fire: a user's first signal that
 * they were out of capacity was the hard refusal itself.
 *
 * The header value is structured and machine-parseable so the client can
 * localize it, rather than a pre-baked English sentence:
 *
 *   level=warning; scope=billing_period; used_percent=87; threshold_percent=80
 * ──────────────────────────────────────────────────────────────────────────── */

/** Percentage of an allowance at which a warning starts being emitted. */
export const QUOTA_WARNING_THRESHOLD_PERCENT = 80;
/** Percentage at which the warning escalates to `level=critical`. */
export const QUOTA_CRITICAL_THRESHOLD_PERCENT = 95;

export type QuotaWarningScope = 'billing_period' | 'rolling_five_hour' | 'rolling_weekly';

export interface QuotaWarningInput {
  planTier: string | null | undefined;
  /** Paid-ledger cents already consumed in the current billing period. */
  creditsUsedCents: number;
  /** Paid-ledger cents allocated for the current billing period. */
  creditsAllocatedCents: number;
  /** Estimated cost of the request being admitted, included in the projection. */
  estimatedCostCents?: number;
  /** Optional rolling-window observations, when the caller already has them. */
  rolling?: {
    sessionUsedCents?: number;
    weeklyUsedCents?: number;
  };
}

interface ScoredWindow {
  scope: QuotaWarningScope;
  percent: number;
}

function projectedPercent(used: number, estimated: number, limit: number): number | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return toPublicUsagePercentage(Math.max(0, used) + Math.max(0, estimated), limit);
}

/**
 * Build the `X-Quota-Warning` value for one admitted request, or null when
 * every applicable allowance is still below the warning threshold.
 *
 * A tier that declares itself uncapped never warns — it has no ceiling to
 * approach. The WORST window wins, so a user at 60% of their month but 92% of
 * their rolling 5 hours is warned about the window that will actually stop
 * them next.
 */
export function buildQuotaWarningHeader(input: QuotaWarningInput): string | null {
  if (isPlanUsageUncapped(input.planTier)) return null;

  const estimated = input.estimatedCostCents ?? 0;
  const candidates: ScoredWindow[] = [];

  const periodPercent = projectedPercent(
    input.creditsUsedCents,
    estimated,
    input.creditsAllocatedCents,
  );
  if (periodPercent !== null) candidates.push({ scope: 'billing_period', percent: periodPercent });

  const sessionPercent = projectedPercent(
    input.rolling?.sessionUsedCents ?? 0,
    estimated,
    getPlanSessionUsageBudgetCents(input.planTier),
  );
  if (input.rolling?.sessionUsedCents !== undefined && sessionPercent !== null) {
    candidates.push({ scope: 'rolling_five_hour', percent: sessionPercent });
  }

  const weeklyPercent = projectedPercent(
    input.rolling?.weeklyUsedCents ?? 0,
    estimated,
    getPlanWeeklyUsageBudgetCents(input.planTier),
  );
  if (input.rolling?.weeklyUsedCents !== undefined && weeklyPercent !== null) {
    candidates.push({ scope: 'rolling_weekly', percent: weeklyPercent });
  }

  let worst: ScoredWindow | null = null;
  for (const candidate of candidates) {
    if (!worst || candidate.percent > worst.percent) worst = candidate;
  }

  if (!worst || worst.percent < QUOTA_WARNING_THRESHOLD_PERCENT) return null;

  const level = worst.percent >= QUOTA_CRITICAL_THRESHOLD_PERCENT ? 'critical' : 'warning';

  return [
    `level=${level}`,
    `scope=${worst.scope}`,
    `used_percent=${Math.round(worst.percent)}`,
    `threshold_percent=${QUOTA_WARNING_THRESHOLD_PERCENT}`,
  ].join('; ');
}
