import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';

export interface RollingUsage {
  usedCents: number;
  /** Timestamp of the oldest transaction inside the window, or null if no usage yet. */
  oldestAt: string | null;
}

/**
 * Sum of deducted cents in the trailing `windowHours` for `userId` (plus the
 * oldest transaction timestamp in that window, so callers can compute when
 * the rolling window will next clear), optionally scoped to flagship-model
 * transactions only (`metadata->>'is_flagship'`, written by the canonical
 * managed-usage reservation and settlement lifecycle).
 *
 * Derived entirely from `credit_transactions` (`transaction_type =
 * 'deduction'`, `amount_cents`, `created_at`) — no dedicated session/weekly
 * table exists or is needed; every credit deduction already inserts a row there.
 *
 * VALUATION BASIS — this is a net projection, not a settled total. The managed
 * lifecycle writes two rows per request: the reservation deducts the ESTIMATE
 * (`reserve_managed_usage_request`, 0056_managed_usage_request_lifecycle.sql,
 * metadata `type = 'managed_usage_reservation'`), and finalization deducts the
 * signed delta to the settled cost (`type = 'managed_usage_finalization'`,
 * carrying both `estimated_cost_cents` and `actual_cost_cents`). So the sum is
 * settled cost for every request that has finalized inside the window, and the
 * unsettled estimate for every request still in flight. Two known ways it
 * diverges from settled spend, both deliberate and both tolerable for an
 * admission meter but NOT for financial reporting:
 *   - a request whose reservation aged out of the window while its negative
 *     finalization delta is still inside understates the window;
 *   - media generation and the no-provider-usage chat path settle a rate-card
 *     estimate AS the actual cost (see managed-usage-accounting-service.ts's
 *     `reservation_estimate_no_provider_usage` branch), so those rows never
 *     converge on observed provider usage.
 *
 * Used by managed-usage-summary-service.ts for the user-visible rolling meter,
 * which exposes only a percentage of cap — never a monetary figure — so no
 * estimate reaches the user as an audited amount.
 */
export async function getRollingUsage(
  userId: string,
  windowHours: number,
  flagshipOnly: boolean,
): Promise<RollingUsage> {
  const db = getNeonDb();
  try {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const flagshipFilter = flagshipOnly ? `and metadata->>'is_flagship' = 'true'` : '';
    const [row] = await db.query<{ used_cents: number | null; oldest_at: string | null }>(
      `select coalesce(sum(amount_cents), 0)::int as used_cents, min(created_at)::text as oldest_at
       from credit_transactions
       where user_id = $1 and transaction_type = 'deduction' and created_at >= $2 ${flagshipFilter}`,
      [userId, windowStart],
    );
    return { usedCents: row?.used_cents ?? 0, oldestAt: row?.oldest_at ?? null };
  } catch (error) {
    logger.warn(
      {
        userId,
        windowHours,
        flagshipOnly,
        error: error instanceof Error ? error.message : String(error),
      },
      '[getRollingUsage] Failed to fetch rolling usage · treating as 0 used',
    );
    return { usedCents: 0, oldestAt: null };
  }
}
