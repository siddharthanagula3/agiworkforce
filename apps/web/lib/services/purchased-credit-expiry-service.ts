import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PURCHASED_CREDIT_EXPIRY_RULES,
  creditsFromMicrousd,
  formatCredits,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { absoluteUrl } from '@/lib/seo/site';
import { sendBillingNotice } from '@/lib/services/billing-notice-service';

export interface PurchasedCreditExpirySummary {
  users: number;
  expiredMicrousd: number;
  failed: number;
  remaining: boolean;
}

export interface PurchasedCreditReminderSummary {
  users: number;
  reminded: number;
  failed: number;
  remaining: boolean;
}

interface DuePurchase {
  id: string;
  user_id: string;
  expires_at: string | Date;
  created_at: string | Date;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function expireDuePurchasedCredits(
  db: DatabaseAdapter,
  maxUsers: number,
): Promise<PurchasedCreditExpirySummary> {
  const due = await db.query<{ user_id: string }>(
    `select purchase_row.user_id
       from public.expiring_credit_purchases purchase_row
      where purchase_row.expired_at is null
        and purchase_row.expires_at <= now()
      group by purchase_row.user_id
      order by min(purchase_row.expires_at)
      limit $1`,
    [maxUsers + 1],
  );
  const summary: PurchasedCreditExpirySummary = {
    users: 0,
    expiredMicrousd: 0,
    failed: 0,
    remaining: due.length > maxUsers,
  };
  for (const { user_id: userId } of due.slice(0, maxUsers)) {
    try {
      const [row] = await db.transaction((tx) =>
        tx.query<{ expired_microusd: number | string }>(
          'select * from public.reconcile_expiring_credit_purchases($1::text)',
          [userId],
        ),
      );
      summary.users += 1;
      summary.expiredMicrousd += toNumber(row?.expired_microusd);
    } catch (error) {
      summary.failed += 1;
      logger.error({ error, userId }, 'Purchased credit expiry failed for an account');
    }
  }
  return summary;
}

async function remindAccount(
  db: DatabaseAdapter,
  userId: string,
  purchases: readonly DuePurchase[],
): Promise<boolean> {
  const lots = await db.query<{ lot_id: string; remaining_microusd: number | string }>(
    `select lot_id, remaining_microusd
       from public.prepaid_credit_lots_microusd($1::text)
      where lot_kind = 'purchase'`,
    [userId],
  );
  const remainingById = new Map(lots.map((lot) => [lot.lot_id, toNumber(lot.remaining_microusd)]));
  const lines = purchases
    .map((purchase) => ({ purchase, microusd: remainingById.get(purchase.id) ?? 0 }))
    .filter(({ microusd }) => microusd > 0)
    .map(
      ({ purchase, microusd }) =>
        `${formatCredits(creditsFromMicrousd(microusd))} bought on ${formatDate(purchase.created_at)} expire on ${formatDate(purchase.expires_at)}.`,
    );

  if (lines.length > 0) {
    const earliest = purchases.reduce((first, purchase) =>
      new Date(purchase.expires_at) < new Date(first.expires_at) ? purchase : first,
    );
    await sendBillingNotice(db, {
      userId,
      title: `Purchased credits expire on ${formatDate(earliest.expires_at)}`,
      message: `${lines.join(' ')} Credits bought in Japan expire six months after purchase, so use them before that date.`,
      target: { kind: 'settings', id: 'usage' },
      dedupeKey: `purchased-credit-expiry:${userId}:${earliest.id}`,
      action: { label: 'See your credits', url: absoluteUrl('/settings/usage') },
    });
  }

  await db.execute(
    `update public.expiring_credit_purchases
        set reminded_at = now()
      where user_id = $1
        and id = any($2::uuid[])
        and reminded_at is null`,
    [userId, purchases.map((purchase) => purchase.id)],
  );
  return lines.length > 0;
}

export async function remindExpiringPurchasedCredits(
  db: DatabaseAdapter,
  maxPurchases: number,
): Promise<PurchasedCreditReminderSummary> {
  const summary: PurchasedCreditReminderSummary = {
    users: 0,
    reminded: 0,
    failed: 0,
    remaining: false,
  };
  for (const rule of PURCHASED_CREDIT_EXPIRY_RULES) {
    const due = await db.query<DuePurchase>(
      `select purchase_row.id, purchase_row.user_id, purchase_row.expires_at,
              purchase_row.created_at
         from public.expiring_credit_purchases purchase_row
        where purchase_row.purchase_country = $1
          and purchase_row.reminded_at is null
          and purchase_row.expired_at is null
          and purchase_row.remaining_microusd > 0
          and purchase_row.expires_at > now()
          and purchase_row.expires_at <= now() + make_interval(days => $2)
        order by purchase_row.expires_at
        limit $3`,
      [rule.country, rule.reminderDays, maxPurchases + 1],
    );
    summary.remaining ||= due.length > maxPurchases;
    const byUser = new Map<string, DuePurchase[]>();
    for (const purchase of due.slice(0, maxPurchases)) {
      byUser.set(purchase.user_id, [...(byUser.get(purchase.user_id) ?? []), purchase]);
    }
    for (const [userId, purchases] of byUser) {
      try {
        const reminded = await remindAccount(db, userId, purchases);
        summary.users += 1;
        if (reminded) summary.reminded += purchases.length;
      } catch (error) {
        summary.failed += 1;
        logger.error({ error, userId }, 'Purchased credit expiry reminder failed for an account');
      }
    }
  }
  return summary;
}
