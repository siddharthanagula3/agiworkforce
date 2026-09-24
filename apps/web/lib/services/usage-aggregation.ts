import 'server-only';

/**
 * The one definition of what "usage" means when it is read back.
 *
 * A workspace administrator and the person who spent the money must be shown
 * the same number for the same turn, so both readers group the same rows of
 * `managed_usage_requests` by the same predicates and sum the same columns.
 * Two copies of these fragments would let one surface count a released turn
 * the other excluded.
 *
 * Cost is summed from `actual_cost_cents`, which is what the turn was charged
 * when it settled. Nothing here multiplies a stored quantity by a live rate,
 * so a later price change cannot move a figure already reported.
 */

/**
 * Only settled turns count.
 *
 * A reservation that was declined, released, or is still in flight has not cost
 * anything, and including it would inflate the number budgeted against.
 * `outcome_unknown` is excluded for the same reason: it is unresolved, not
 * spent.
 */
export const SETTLED = `status = 'completed'`;

/**
 * In flight or unresolved, so the settled totals can still grow. Not
 * `released` or `declined`: those turns are over and will never cost anything.
 */
export const UNSETTLED = `status = any (array['reserving', 'reserved', 'provider_started', 'outcome_unknown'])`;

/**
 * Token counts live in the `usage` jsonb rather than in columns. Coalesced to
 * zero so a provider that reported no usage lowers nothing but the token count,
 * its cost still counts.
 */
export const TOKENS = `
  coalesce((usage->>'input_tokens')::numeric, (usage->>'prompt_tokens')::numeric, 0)`;
export const OUT_TOKENS = `
  coalesce((usage->>'output_tokens')::numeric, (usage->>'completion_tokens')::numeric, 0)`;

/** A group-by that returns more rows than this is a report nobody reads. */
export const BREAKDOWN_LIMIT = 50;

export interface AggregateRow {
  key: string | null;
  requests: string | number | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost_cents: string | number | null;
}

export interface DayRow {
  day: string | Date;
  requests: string | number | null;
  cost_cents: string | number | null;
}

export interface FreshnessRow {
  latest_activity_at: string | Date | null;
  unsettled_requests: string | number | null;
}

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageBreakdownRow {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageDayRow {
  day: string;
  requests: number;
  costCents: number;
}

/**
 * Why a total can still move. `asOf` is when this answer was computed,
 * `latestActivityAt` is the newest turn it could see, and `unsettledRequests`
 * is the count of turns inside the window that have not settled yet, which is
 * the only reason a figure read today can be larger tomorrow.
 */
export interface UsageFreshness {
  asOf: string;
  latestActivityAt: string | null;
  unsettledRequests: number;
}

/** The driver returns bigint and numeric columns as strings. */
export function num(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

export function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toRow(row: AggregateRow): UsageBreakdownRow {
  return {
    key: row.key ?? 'unknown',
    requests: num(row.requests),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    costCents: num(row.cost_cents),
  };
}

export function toTotals(row: AggregateRow | undefined): UsageTotals {
  const totals = row ? toRow(row) : null;
  return {
    requests: totals?.requests ?? 0,
    inputTokens: totals?.inputTokens ?? 0,
    outputTokens: totals?.outputTokens ?? 0,
    costCents: totals?.costCents ?? 0,
  };
}

export function toDays(rows: readonly DayRow[]): UsageDayRow[] {
  return rows.map((row) => ({
    day: row.day instanceof Date ? row.day.toISOString() : String(row.day),
    requests: num(row.requests),
    costCents: num(row.cost_cents),
  }));
}

export function toFreshness(row: FreshnessRow | undefined): UsageFreshness {
  return {
    asOf: new Date().toISOString(),
    latestActivityAt: toIsoOrNull(row?.latest_activity_at ?? null),
    unsettledRequests: num(row?.unsettled_requests),
  };
}

/** A window longer than this makes the group-by scan unbounded in practice. */
export const USAGE_MAX_WINDOW_DAYS = 366;
export const USAGE_DEFAULT_WINDOW_DAYS = 30;

/**
 * Clamps a requested window.
 *
 * An open-ended range would let one caller request a group-by over every row
 * they have ever produced, on the same connection that serves live turns.
 */
export function resolveUsageWindow(
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = toParam ? new Date(toParam) : now;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;

  const requestedFrom = fromParam ? new Date(fromParam) : null;
  const defaultFrom = new Date(safeTo.getTime() - USAGE_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from =
    requestedFrom && !Number.isNaN(requestedFrom.getTime()) ? requestedFrom : defaultFrom;

  const earliest = new Date(safeTo.getTime() - USAGE_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clampedFrom = from < earliest ? earliest : from;

  return {
    from: (clampedFrom > safeTo ? safeTo : clampedFrom).toISOString(),
    to: safeTo.toISOString(),
  };
}
