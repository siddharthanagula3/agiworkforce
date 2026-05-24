import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';

export interface CreditBalance {
  account_id: string;
  period_start: string;
  period_end: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  last_daily_reset_at?: string;
}

export interface DeductCreditsResult {
  success: boolean;
  account_id?: string;
  remaining_cents?: number;
  error?: string;
  code?: string;
  available?: number;
  required?: number;
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
}

export class CreditService {
  static getDailyLimit(monthlyCents: number): number {
    return monthlyCents;
  }

  static async getBalance(
    dbOrUserId: DatabaseAdapter | string,
    userId?: string,
  ): Promise<CreditBalance | null> {
    let db: DatabaseAdapter;
    let resolvedUserId: string;
    if (typeof dbOrUserId === 'string') {
      db = getNeonDb();
      resolvedUserId = dbOrUserId;
    } else {
      db = dbOrUserId;
      resolvedUserId = userId!;
    }

    try {
      const rows = await db.query<CreditBalance>('select * from get_credit_balance($1)', [
        resolvedUserId,
      ]);
      return rows.length > 0 ? rows[0]! : null;
    } catch (error) {
      logger.error({ error, userId: resolvedUserId }, 'Error in getBalance');
      throw error;
    }
  }

  static async checkAvailable(
    dbOrUserId: DatabaseAdapter | string,
    userIdOrAmount: string | number,
    amountCents?: number,
  ): Promise<boolean> {
    let db: DatabaseAdapter;
    let resolvedUserId: string;
    let resolvedAmount: number;
    if (typeof dbOrUserId === 'string') {
      db = getNeonDb();
      resolvedUserId = dbOrUserId;
      resolvedAmount = userIdOrAmount as number;
    } else {
      db = dbOrUserId;
      resolvedUserId = userIdOrAmount as string;
      resolvedAmount = amountCents!;
    }

    try {
      const [row] = await db.query<{ check_credits_available: boolean }>(
        'select check_credits_available($1, $2) as check_credits_available',
        [resolvedUserId, resolvedAmount],
      );
      return row?.check_credits_available === true;
    } catch (error) {
      logger.error(
        { error, userId: resolvedUserId, amountCents: resolvedAmount },
        'RPC check_credits_available failed, trying fallback',
      );
      try {
        const balance = await this.getBalance(db, resolvedUserId);
        if (!balance?.account_id) return false;
        return balance.credits_remaining_cents >= resolvedAmount;
      } catch {
        return false;
      }
    }
  }

  static async deductCredits(
    dbOrUserId: DatabaseAdapter | string,
    userIdOrAmount: string | number,
    amountCentsOrDescription?: number | string,
    descriptionOrMetadata?: string | Record<string, unknown>,
    metadataOrIdempotencyKey?: Record<string, unknown> | string,
    idempotencyKey?: string,
  ): Promise<DeductCreditsResult> {
    let db: DatabaseAdapter;
    let resolvedUserId: string;
    let resolvedAmountCents: number;
    let resolvedDescription: string | undefined;
    let resolvedMetadata: Record<string, unknown> | undefined;
    let resolvedIdempotencyKey: string | undefined;

    if (typeof dbOrUserId === 'string') {
      db = getNeonDb();
      resolvedUserId = dbOrUserId;
      resolvedAmountCents = userIdOrAmount as number;
      resolvedDescription = amountCentsOrDescription as string | undefined;
      resolvedMetadata = descriptionOrMetadata as Record<string, unknown> | undefined;
      resolvedIdempotencyKey = metadataOrIdempotencyKey as string | undefined;
    } else {
      db = dbOrUserId;
      resolvedUserId = userIdOrAmount as string;
      resolvedAmountCents = amountCentsOrDescription as number;
      resolvedDescription = descriptionOrMetadata as string | undefined;
      resolvedMetadata = metadataOrIdempotencyKey as Record<string, unknown> | undefined;
      resolvedIdempotencyKey = idempotencyKey;
    }

    try {
      const rows = await db.query<DeductCreditsResult>(
        'select * from deduct_credits($1, $2, $3, $4, $5)',
        [
          resolvedUserId,
          resolvedAmountCents,
          resolvedDescription || null,
          JSON.stringify(resolvedMetadata || {}),
          resolvedIdempotencyKey || null,
        ],
      );
      const result = rows.length > 0 ? rows[0]! : { success: false, error: 'No result' };
      return result;
    } catch (error) {
      logger.error(
        { error, userId: resolvedUserId, amountCents: resolvedAmountCents },
        'Error in deductCredits',
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static generateIdempotencyKey(
    userId: string,
    operationType: 'reservation' | 'reconciliation' | 'refund',
    requestId: string,
  ): string {
    return `${userId}:${operationType}:${requestId}`;
  }

  static async getOrCreateAccount(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    const db = getNeonDb();
    try {
      const [row] = await db.query<{ get_or_create_credit_account: string }>(
        'select get_or_create_credit_account($1, $2, $3, $4, $5) as get_or_create_credit_account',
        [
          userId,
          subscriptionId,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          creditsAllocatedCents,
        ],
      );
      return row?.get_or_create_credit_account ?? '';
    } catch (error) {
      logger.error({ error, userId, subscriptionId }, 'Error in getOrCreateAccount');
      throw error;
    }
  }

  static async resetForPeriod(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    const db = getNeonDb();
    try {
      const [row] = await db.query<{ reset_credits_for_period: string }>(
        'select reset_credits_for_period($1, $2, $3, $4, $5) as reset_credits_for_period',
        [
          userId,
          subscriptionId,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          creditsAllocatedCents,
        ],
      );
      return row?.reset_credits_for_period ?? '';
    } catch (error) {
      logger.error({ error, userId, subscriptionId }, 'Error in resetForPeriod');
      throw error;
    }
  }
}
