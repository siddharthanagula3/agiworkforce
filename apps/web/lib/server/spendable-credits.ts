import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';

export interface SpendableCreditState {
  availableMicrousd: number | null;
  availableCents: number | null;
  overageEnabled: boolean;
}

interface SpendableCreditRow {
  overage_enabled: boolean;
  available_microusd: number | string | null;
}

const SELECT_SPENDABLE_CREDITS = `
  select
    subscription.overage_enabled,
    coalesce((
      select greatest(least(
               credits.credits_allocated_microusd - credits.credits_used_microusd,
               credits.top_up_allocated_microusd
             ), 0)
        from public.token_credits credits
       where credits.user_id = subscription.user_id
         and credits.period_end > now()
       order by credits.period_end desc
       limit 1
    ), 0) as available_microusd
  from public.subscriptions subscription
  where subscription.user_id = $1
  limit 1`;

export async function getSpendableCredits(
  db: DatabaseAdapter,
  userId: string,
): Promise<SpendableCreditState> {
  try {
    const rows = await db.query<SpendableCreditRow>(SELECT_SPENDABLE_CREDITS, [userId]);
    const row = rows[0];
    if (row === undefined) {
      return { availableMicrousd: 0, availableCents: 0, overageEnabled: false };
    }
    const available = Number(row.available_microusd ?? 0);
    const availableMicrousd =
      Number.isFinite(available) && available > 0 ? Math.floor(available) : 0;
    return {
      availableMicrousd,
      availableCents: ledgerCentsFromMicrousd(availableMicrousd),
      overageEnabled: row.overage_enabled === true,
    };
  } catch (error) {
    logger.warn({ error, userId }, 'Spendable credit lookup failed; reporting unknown balance');
    return { availableMicrousd: null, availableCents: null, overageEnabled: false };
  }
}
