import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';

export interface RollingUsage {
  /**
   * Authoritative spend in the window. Migration 0182 makes `amount_microusd`
   * the ledger unit and says so on the column itself: "Rolling windows sum this
   * column; amount_cents is a per-row mirror and does not sum to it."
   */
  usedMicrousd: number;
  /**
   * Round-half-up mirror of `usedMicrousd`, for readers that still speak cents.
   * Derived from the summed total, never summed from per-row mirrors, which is
   * the distinction the migration draws: mirroring a total is off by at most
   * half a cent, summing rounded deltas drifts by half a cent per request.
   */
  usedCents: number;
  oldestAt: string | null;
}

/** Round-half-up, matching the SQL `microusd_to_cents_mirror`. */
export function centsMirrorOfMicrousd(microusd: number): number {
  return Math.floor((microusd + MICROUSD_PER_LEDGER_CENT / 2) / MICROUSD_PER_LEDGER_CENT);
}

/**
 * Managed-usage spend in a rolling window.
 *
 * Only `deduction` rows are summed, and they are summed SIGNED. A reservation
 * writes a positive deduction, its reconciliation writes the delta to actual
 * cost, and a release writes a negative one, so the signed sum is the amount
 * the user actually consumed. `refund` rows are a different concept: they
 * revoke granted credit after a payment refund and raise `credits_used`, so
 * they are deliberately not part of consumption in a window.
 */
export async function getRollingUsage(
  db: DatabaseAdapter,
  userId: string,
  windowHours: number,
  flagshipOnly: boolean,
): Promise<RollingUsage> {
  try {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const flagshipFilter = flagshipOnly ? `and metadata->>'is_flagship' = 'true'` : '';
    const [row] = await db.query<{
      used_microusd: string | number | null;
      oldest_at: string | null;
    }>(
      `select coalesce(sum(amount_microusd), 0)::bigint as used_microusd,
              min(created_at)::text as oldest_at
       from credit_transactions
       where user_id = $1 and transaction_type = 'deduction' and created_at >= $2 ${flagshipFilter}`,
      [userId, windowStart],
    );
    // bigint arrives as a string on the wire; Number is exact well past any
    // realistic window total (2^53 microUSD is ~$9 billion).
    const usedMicrousd = Math.max(0, Math.trunc(Number(row?.used_microusd ?? 0)) || 0);
    return {
      usedMicrousd,
      usedCents: centsMirrorOfMicrousd(usedMicrousd),
      oldestAt: row?.oldest_at ?? null,
    };
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
    return { usedMicrousd: 0, usedCents: 0, oldestAt: null };
  }
}
