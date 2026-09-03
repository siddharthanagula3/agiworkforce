import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

export type SpendEnforcement = 'off' | 'notify' | 'block';

export interface SpendLimit {
  organizationId: string;
  monthlyCapCents: number;
  enforcement: SpendEnforcement;
  alertThresholdPct: number;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface SpendState {
  configured: boolean;
  monthlyCapCents: number | null;
  enforcement: SpendEnforcement;
  alertThresholdPct: number;
  spentCents: number;
  /** null when uncapped, so a caller cannot divide by a cap that is not there. */
  usedPct: number | null;
  overCap: boolean;
  overThreshold: boolean;
}

export type SpendDecisionCode = 'allowed' | 'ungoverned' | 'over_cap';

export interface SpendDecision {
  allowed: boolean;
  code: SpendDecisionCode;
  reason: string;
  state: SpendState | null;
}

const UNGOVERNED: SpendDecision = {
  allowed: true,
  code: 'ungoverned',
  reason: 'No workspace spend limit applies to this request.',
  state: null,
};

/**
 * How long a spend decision is reused before the sum is recomputed.
 *
 * Summing month-to-date spend on every turn would put an aggregate scan on the
 * hot path. Caching makes enforcement EVENTUAL rather than exact: a workspace
 * can overshoot its cap by roughly one window of spend. That trade is stated in
 * the console in those words, because a cap presented as exact when it is not is
 * the same class of lie as a retention window nothing sweeps.
 */
export const SPEND_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  decision: SpendDecision;
}

const cache = new Map<string, CacheEntry>();

/** Test seam. Production never calls this. */
export function __clearSpendCacheForTests(): void {
  cache.clear();
}

interface LimitAndSpendRow {
  monthly_cap_cents: number | null;
  enforcement: SpendEnforcement | null;
  alert_threshold_pct: number | null;
  spent_cents: string | number | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

/**
 * Reads the cap and the month-to-date spend in ONE round trip.
 *
 * A separate limit read followed by a sum would double the latency this adds to
 * every governed turn, and the two could disagree if a write landed between
 * them. Returns no row when the workspace has no limit, which reads as
 * ungoverned.
 */
export async function readSpendState(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SpendState> {
  const [row] = await db.query<LimitAndSpendRow>(
    `select l.monthly_cap_cents,
            l.enforcement,
            l.alert_threshold_pct,
            coalesce((
              select sum(coalesce(m.actual_cost_cents, 0))
                from public.managed_usage_requests m
               where m.organization_id = $1
                 and m.status = 'completed'
                 and m.created_at >= date_trunc('month', now())
            ), 0) as spent_cents
       from public.organization_spend_limits l
      where l.organization_id = $1
      limit 1`,
    [organizationId],
  );

  if (!row || row.monthly_cap_cents === null) {
    return {
      configured: false,
      monthlyCapCents: null,
      enforcement: 'off',
      alertThresholdPct: 80,
      spentCents: 0,
      usedPct: null,
      overCap: false,
      overThreshold: false,
    };
  }

  const cap = row.monthly_cap_cents;
  const spent = toNumber(row.spent_cents);
  const threshold = row.alert_threshold_pct ?? 80;

  return {
    configured: true,
    monthlyCapCents: cap,
    enforcement: row.enforcement ?? 'off',
    alertThresholdPct: threshold,
    spentCents: spent,
    usedPct: Math.round((spent / cap) * 100),
    overCap: spent >= cap,
    overThreshold: spent >= (cap * threshold) / 100,
  };
}

export async function evaluateSpendLimit(
  db: DatabaseAdapter,
  organizationId: string | null,
  options: { now?: number } = {},
): Promise<SpendDecision> {
  if (!organizationId) return UNGOVERNED;

  const now = options.now ?? Date.now();
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > now) return cached.decision;

  let state: SpendState;
  try {
    state = await readSpendState(db, organizationId);
  } catch (error) {
    logger.error(
      { error, organizationId },
      '[spend-limit] state unavailable; request treated as ungoverned',
    );
    return UNGOVERNED;
  }

  const decision: SpendDecision =
    state.configured && state.enforcement === 'block' && state.overCap
      ? {
          allowed: false,
          code: 'over_cap',
          reason:
            'This workspace has reached its monthly spend limit. An owner or admin can raise it, or wait until the limit resets at the start of next month.',
          state,
        }
      : {
          allowed: true,
          code: state.configured ? 'allowed' : 'ungoverned',
          reason: 'Within the workspace spend limit.',
          state,
        };

  cache.set(organizationId, { expiresAt: now + SPEND_CACHE_TTL_MS, decision });
  return decision;
}

/** Drops the cached decision so a raised cap takes effect at once rather than after the window. */
export function invalidateSpendDecision(organizationId: string): void {
  cache.delete(organizationId);
}

export interface SpendLimitInput {
  monthlyCapCents: number;
  enforcement: SpendEnforcement;
  alertThresholdPct: number;
}

interface LimitRow {
  organization_id: string;
  monthly_cap_cents: number;
  enforcement: SpendEnforcement;
  alert_threshold_pct: number;
  updated_by_user_id: string | null;
  updated_at: string | Date;
}

const LIMIT_COLUMNS = `organization_id, monthly_cap_cents, enforcement,
  alert_threshold_pct, updated_by_user_id, updated_at`;

function formatLimit(row: LimitRow): SpendLimit {
  return {
    organizationId: row.organization_id,
    monthlyCapCents: row.monthly_cap_cents,
    enforcement: row.enforcement,
    alertThresholdPct: row.alert_threshold_pct,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function readSpendLimit(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SpendLimit | null> {
  const [row] = await db.query<LimitRow>(
    `select ${LIMIT_COLUMNS} from public.organization_spend_limits
      where organization_id = $1 limit 1`,
    [organizationId],
  );
  return row ? formatLimit(row) : null;
}

export async function upsertSpendLimit(
  db: DatabaseAdapter,
  organizationId: string,
  input: SpendLimitInput,
  updatedByUserId: string,
): Promise<SpendLimit> {
  const [row] = await db.query<LimitRow>(
    `insert into public.organization_spend_limits
       (organization_id, monthly_cap_cents, enforcement, alert_threshold_pct, updated_by_user_id)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id) do update set
       monthly_cap_cents   = excluded.monthly_cap_cents,
       enforcement         = excluded.enforcement,
       alert_threshold_pct = excluded.alert_threshold_pct,
       updated_by_user_id  = excluded.updated_by_user_id
     returning ${LIMIT_COLUMNS}`,
    [
      organizationId,
      input.monthlyCapCents,
      input.enforcement,
      input.alertThresholdPct,
      updatedByUserId,
    ],
  );
  if (!row)
    throw new Error(`organization_spend_limits upsert returned no row for ${organizationId}`);

  // A raised cap must free the workspace immediately, not a cache window later.
  invalidateSpendDecision(organizationId);
  return formatLimit(row);
}

export async function deleteSpendLimit(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<boolean> {
  const rows = await db.query<{ organization_id: string }>(
    `delete from public.organization_spend_limits
      where organization_id = $1 returning organization_id`,
    [organizationId],
  );
  invalidateSpendDecision(organizationId);
  return rows.length > 0;
}
