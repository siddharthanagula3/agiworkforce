import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

export interface RollingUsage {
  usedCents: number;
  oldestAt: string | null;
}

export async function getRollingUsage(
  db: DatabaseAdapter,
  userId: string,
  windowHours: number,
  flagshipOnly: boolean,
): Promise<RollingUsage> {
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
