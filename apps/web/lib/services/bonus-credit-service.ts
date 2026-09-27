import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MICROUSD_PER_CREDIT, creditsFromMicrousd, microusdFromCredits } from '@agiworkforce/types';
import { logger } from '@/lib/logger';

export const BONUS_CREDIT_EXPIRY_DAYS = 90;

const DAY_MS = 86_400_000;

export type BonusCreditSource = 'referral_referrer' | 'referral_friend' | 'promo';

export interface BonusCreditGrantInput {
  userId: string;
  source: BonusCreditSource;
  credits: number;
  referenceId: string;
  organizationId?: string | null;
  createdBy?: string | null;
  grantedAt?: Date;
}

export interface BonusCreditReconciliation {
  expiredMicrousd: number;
  carriedMicrousd: number;
  materializedMicrousd: number;
}

export interface PrepaidCreditLot {
  credits: number;
  expiresAt: string;
}

export interface BonusCreditLot extends PrepaidCreditLot {
  source: BonusCreditSource;
}

export interface PrepaidCreditBalances {
  bonusCredits: number;
  purchasedCredits: number;
  expiringPurchasedCredits: number;
  overageHeadroomMicrousd: number;
  nextBonusExpiry: string | null;
  nextPurchaseExpiry: string | null;
  bonusGrants: BonusCreditLot[];
  expiringPurchases: PrepaidCreditLot[];
}

export interface BonusCreditSweepSummary {
  users: number;
  expiredMicrousd: number;
  failed: number;
  remaining: boolean;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.length > 0 ? new Date(value).toISOString() : null;
}

export function bonusCreditExpiry(grantedAt: Date): Date {
  return new Date(grantedAt.getTime() + BONUS_CREDIT_EXPIRY_DAYS * DAY_MS);
}

export async function grantBonusCredits(
  db: DatabaseAdapter,
  input: BonusCreditGrantInput,
): Promise<string> {
  const amountMicrousd = Math.round(microusdFromCredits(input.credits));
  if (!Number.isSafeInteger(amountMicrousd) || amountMicrousd <= 0) {
    throw new Error('Bonus credit grant must be a positive number of credits');
  }
  const [row] = await db.query<{ grant_id: string | null }>(
    `select public.grant_bonus_credits(
       $1::text, $2::text, $3::bigint, $4::integer, $5::timestamptz, $6::text, $7::uuid, $8::text
     ) as grant_id`,
    [
      input.userId,
      input.source,
      amountMicrousd,
      MICROUSD_PER_CREDIT,
      bonusCreditExpiry(input.grantedAt ?? new Date()).toISOString(),
      input.referenceId,
      input.organizationId ?? null,
      input.createdBy ?? null,
    ],
  );
  if (!row?.grant_id) throw new Error('Bonus credit grant returned no grant');
  return row.grant_id;
}

export async function revokeBonusCreditGrant(
  db: DatabaseAdapter,
  grantId: string,
  description: string,
): Promise<number> {
  const [row] = await db.query<{ revoked_microusd: number | string | null }>(
    'select public.revoke_bonus_credit_grant($1::uuid, $2::text) as revoked_microusd',
    [grantId, description],
  );
  return toNumber(row?.revoked_microusd);
}

export async function reconcileBonusCredits(
  db: DatabaseAdapter,
  userId: string,
): Promise<BonusCreditReconciliation> {
  const [row] = await db.query<{
    expired_microusd: number | string;
    carried_microusd: number | string;
    materialized_microusd: number | string;
  }>('select * from public.reconcile_bonus_credit_grants($1::text)', [userId]);
  return {
    expiredMicrousd: toNumber(row?.expired_microusd),
    carriedMicrousd: toNumber(row?.carried_microusd),
    materializedMicrousd: toNumber(row?.materialized_microusd),
  };
}

export async function expireDueBonusCredits(
  db: DatabaseAdapter,
  maxUsers: number,
): Promise<BonusCreditSweepSummary> {
  const due = await db.query<{ user_id: string }>(
    `select grant_row.user_id
       from public.bonus_credit_grants grant_row
      where grant_row.revoked_at is null
        and grant_row.remaining_microusd > 0
        and grant_row.expires_at <= now()
      group by grant_row.user_id
      order by min(grant_row.expires_at)
      limit $1`,
    [maxUsers + 1],
  );
  const batch = due.slice(0, maxUsers);
  const summary: BonusCreditSweepSummary = {
    users: 0,
    expiredMicrousd: 0,
    failed: 0,
    remaining: due.length > maxUsers,
  };
  for (const { user_id: userId } of batch) {
    try {
      const result = await db.transaction((tx) => reconcileBonusCredits(tx, userId));
      summary.users += 1;
      summary.expiredMicrousd += result.expiredMicrousd;
    } catch (error) {
      summary.failed += 1;
      logger.error({ error, userId }, 'Bonus credit expiry failed for an account');
    }
  }
  return summary;
}

function isBonusCreditSource(value: string): value is BonusCreditSource {
  return value === 'referral_referrer' || value === 'referral_friend' || value === 'promo';
}

export async function getPrepaidCreditBalances(
  db: DatabaseAdapter,
  userId: string,
): Promise<PrepaidCreditBalances> {
  const [account] = await db.query<{
    purchased_microusd: number | string;
    expiring_purchased_microusd: number | string;
    overage_headroom_microusd: number | string;
    next_bonus_expiry: string | Date | null;
    next_purchase_expiry: string | Date | null;
  }>('select * from public.prepaid_credit_balances_microusd($1::text)', [userId]);
  const lots = await db.query<{
    lot_kind: string;
    source: string;
    remaining_microusd: number | string;
    expires_at: string | Date;
  }>(
    `select lot_kind, source, remaining_microusd, expires_at
       from public.prepaid_credit_lots_microusd($1::text)
      where remaining_microusd > 0
      order by expires_at`,
    [userId],
  );

  const bonusGrants: BonusCreditLot[] = [];
  const expiringPurchases: PrepaidCreditLot[] = [];
  let bonusMicrousd = 0;
  for (const lot of lots) {
    const expiresAt = toIso(lot.expires_at);
    const microusd = toNumber(lot.remaining_microusd);
    if (!expiresAt) continue;
    if (lot.lot_kind === 'purchase') {
      expiringPurchases.push({ credits: creditsFromMicrousd(microusd), expiresAt });
    } else if (isBonusCreditSource(lot.source)) {
      bonusGrants.push({ credits: creditsFromMicrousd(microusd), expiresAt, source: lot.source });
      bonusMicrousd += microusd;
    }
  }

  return {
    bonusCredits: creditsFromMicrousd(bonusMicrousd),
    purchasedCredits: creditsFromMicrousd(toNumber(account?.purchased_microusd)),
    expiringPurchasedCredits: creditsFromMicrousd(toNumber(account?.expiring_purchased_microusd)),
    overageHeadroomMicrousd: toNumber(account?.overage_headroom_microusd),
    nextBonusExpiry: bonusGrants[0]?.expiresAt ?? null,
    nextPurchaseExpiry: expiringPurchases[0]?.expiresAt ?? null,
    bonusGrants,
    expiringPurchases,
  };
}
