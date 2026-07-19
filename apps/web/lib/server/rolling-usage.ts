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
 * table exists or is needed; every credit deduction already inserts a row
 * there, so this rolling sum is real spend, not an estimate.
 *
 * Used by managed-usage-summary-service.ts for the user-visible rolling meter.
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
