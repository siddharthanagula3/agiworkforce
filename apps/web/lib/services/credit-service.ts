import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { retryWithBackoff } from '@/lib/retry';

export const MICROUSD_PER_LEDGER_CENT = 10_000;

export function microusdFromLedgerCents(cents: number): number {
  return Math.round(cents) * MICROUSD_PER_LEDGER_CENT;
}

/** Round-half-up, matching public.microusd_to_cents_mirror. */
export function ledgerCentsFromMicrousd(microusd: number): number {
  return Math.floor((microusd + MICROUSD_PER_LEDGER_CENT / 2) / MICROUSD_PER_LEDGER_CENT);
}

export interface CreditBalance {
  account_id: string;
  period_start: string;
  period_end: string;
  credits_allocated_microusd: number;
  credits_used_microusd: number;
  credits_remaining_microusd: number;
  daily_limit_microusd?: number;
  daily_used_microusd?: number;
  daily_remaining_microusd?: number;
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
  remaining_microusd?: number;
  remaining_cents?: number;
  error?: string;
  code?: string;
  available?: number;
  required?: number;
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
}

/**
 * Exactly one of the two amounts. `amountCents` is the deprecated alias kept so
 * a call site that has not moved to microUSD keeps settling what it settled
 * before; it is multiplied by 10,000 and takes the same path.
 */
export type CreditSettlementAmount =
  | { amountMicrousd: number; amountCents?: never }
  | { amountCents: number; amountMicrousd?: never };

export type CreditSettlementOperation = CreditSettlementAmount & {
  userId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
};

export function resolveSettlementMicrousd(operation: CreditSettlementOperation): number {
  return operation.amountMicrousd !== undefined
    ? Math.round(operation.amountMicrousd)
    : microusdFromLedgerCents(operation.amountCents);
}

export interface CreditSettlementResult {
  status: 'succeeded' | 'pending' | 'terminal';
  success: boolean;
  remaining_microusd?: number;
  remaining_cents?: number;
  code?: string;
  error?: string;
  attempt_count: number;
}

export interface CreditSettlementQueueSummary {
  processed: number;
  succeeded: number;
  pending: number;
  terminal: number;
}

export class CreditSettlementUnavailableError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('Unable to persist credit settlement after retrying transient failures');
    this.name = 'CreditSettlementUnavailableError';
    this.cause = cause;
  }
}

function isRetryableSettlementTransportError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;

  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  if (status === 429 || (status !== undefined && status >= 500 && status < 600)) return true;
  if (status !== undefined && status >= 400 && status < 500) return false;

  const code =
    'code' in error && typeof error.code === 'string' ? error.code.toUpperCase() : undefined;
  if (
    code &&
    (code.startsWith('08') ||
      code.startsWith('53') ||
      ['40001', '40P01', '55P03', '57014', '57P01', '57P02', '57P03'].includes(code) ||
      ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EPIPE'].includes(code))
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('connection reset') ||
    message.includes('connection refused') ||
    message.includes('connection terminated') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable')
  );
}

/** The driver returns bigint columns as strings once they exceed 2^31. */
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBalance(row: Record<string, unknown>): CreditBalance {
  const allocated = numeric(row['credits_allocated_microusd']) ?? 0;
  const used = numeric(row['credits_used_microusd']) ?? 0;
  const remaining = numeric(row['credits_remaining_microusd']) ?? allocated - used;
  const dailyLimit = numeric(row['daily_limit_microusd']);
  const dailyUsed = numeric(row['daily_used_microusd']);
  const dailyRemaining = numeric(row['daily_remaining_microusd']);
  return {
    account_id: String(row['account_id'] ?? ''),
    period_start: String(row['period_start'] ?? ''),
    period_end: String(row['period_end'] ?? ''),
    credits_allocated_microusd: allocated,
    credits_used_microusd: used,
    credits_remaining_microusd: remaining,
    credits_allocated_cents: ledgerCentsFromMicrousd(allocated),
    credits_used_cents: ledgerCentsFromMicrousd(used),
    credits_remaining_cents: ledgerCentsFromMicrousd(remaining),
    ...(dailyLimit !== null
      ? { daily_limit_microusd: dailyLimit, daily_limit_cents: ledgerCentsFromMicrousd(dailyLimit) }
      : {}),
    ...(dailyUsed !== null
      ? { daily_used_microusd: dailyUsed, daily_used_cents: ledgerCentsFromMicrousd(dailyUsed) }
      : {}),
    ...(dailyRemaining !== null
      ? {
          daily_remaining_microusd: dailyRemaining,
          daily_remaining_cents: ledgerCentsFromMicrousd(dailyRemaining),
        }
      : {}),
    ...(typeof row['last_daily_reset_at'] === 'string'
      ? { last_daily_reset_at: row['last_daily_reset_at'] }
      : {}),
  };
}

function parseSettlementResult(row: unknown): CreditSettlementResult {
  if (row === null || typeof row !== 'object') {
    throw Object.assign(new Error('Credit settlement RPC returned no result'), {
      code: 'BILLING_PROTOCOL_ERROR',
    });
  }

  const record = row as Record<string, unknown>;
  const status = record['status'];
  const success = record['success'];
  const attemptCount = record['attempt_count'];
  if (
    (status !== 'succeeded' && status !== 'pending' && status !== 'terminal') ||
    typeof success !== 'boolean' ||
    typeof attemptCount !== 'number'
  ) {
    throw Object.assign(new Error('Credit settlement RPC returned an invalid result'), {
      code: 'BILLING_PROTOCOL_ERROR',
    });
  }

  const remainingMicrousd = numeric(record['remaining_microusd']);

  return {
    status,
    success,
    attempt_count: attemptCount,
    ...(remainingMicrousd !== null ? { remaining_microusd: remainingMicrousd } : {}),
    ...(remainingMicrousd !== null
      ? { remaining_cents: ledgerCentsFromMicrousd(remainingMicrousd) }
      : {}),
    ...(typeof record['code'] === 'string' ? { code: record['code'] } : {}),
    ...(typeof record['error'] === 'string' ? { error: record['error'] } : {}),
  };
}

export class CreditService {
  static getDailyLimit(monthlyCents: number): number {
    return monthlyCents;
  }

  static async getBalance(db: DatabaseAdapter, userId: string): Promise<CreditBalance | null> {
    try {
      const rows = await db.query<Record<string, unknown>>(
        'select * from get_credit_balance_microusd($1)',
        [userId],
      );
      const row = rows[0];
      return row === undefined ? null : normalizeBalance(row);
    } catch (error) {
      logger.error({ error, userId }, 'Error in getBalance');
      throw error;
    }
  }

  static async checkAvailable(
    db: DatabaseAdapter,
    userId: string,
    amountCents: number,
  ): Promise<boolean> {
    return this.checkAvailableMicrousd(db, userId, microusdFromLedgerCents(amountCents));
  }

  static async checkAvailableMicrousd(
    db: DatabaseAdapter,
    userId: string,
    amountMicrousd: number,
  ): Promise<boolean> {
    try {
      const [row] = await db.query<{ check_credits_available: boolean }>(
        'select check_credits_available_microusd($1, $2) as check_credits_available',
        [userId, Math.round(amountMicrousd)],
      );
      return row?.check_credits_available === true;
    } catch (error) {
      logger.error(
        { error, userId, amountMicrousd },
        'RPC check_credits_available_microusd failed, trying fallback',
      );
      try {
        const balance = await this.getBalance(db, userId);
        if (!balance?.account_id) return false;
        return balance.credits_remaining_microusd >= amountMicrousd;
      } catch {
        return false;
      }
    }
  }

  static deductCredits(
    db: DatabaseAdapter,
    userId: string,
    amountCents: number,
    description?: string,
    metadata?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<DeductCreditsResult> {
    return this.deductCreditsMicrousd(
      db,
      userId,
      microusdFromLedgerCents(amountCents),
      description,
      metadata,
      idempotencyKey,
    );
  }

  static async deductCreditsMicrousd(
    db: DatabaseAdapter,
    userId: string,
    amountMicrousd: number,
    description?: string,
    metadata?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<DeductCreditsResult> {
    try {
      const rows = await db.query<Record<string, unknown>>(
        'select * from deduct_credits_microusd($1, $2, $3, $4, $5)',
        [
          userId,
          Math.round(amountMicrousd),
          description || null,
          JSON.stringify(metadata || {}),
          idempotencyKey || null,
        ],
      );
      const row = rows[0];
      if (row === undefined) return { success: false, error: 'No result' };
      const remainingMicrousd = numeric(row['remaining_microusd']);
      return {
        success: row['success'] === true,
        ...(remainingMicrousd !== null
          ? {
              remaining_microusd: remainingMicrousd,
              remaining_cents: ledgerCentsFromMicrousd(remainingMicrousd),
            }
          : {}),
        ...(typeof row['error'] === 'string' ? { error: row['error'] } : {}),
        ...(typeof row['code'] === 'string' ? { code: row['code'] } : {}),
        ...(numeric(row['daily_limit_microusd']) !== null
          ? { daily_limit: ledgerCentsFromMicrousd(numeric(row['daily_limit_microusd'])!) }
          : {}),
        ...(numeric(row['daily_used_microusd']) !== null
          ? { daily_used: ledgerCentsFromMicrousd(numeric(row['daily_used_microusd'])!) }
          : {}),
        ...(numeric(row['daily_remaining_microusd']) !== null
          ? { daily_remaining: ledgerCentsFromMicrousd(numeric(row['daily_remaining_microusd'])!) }
          : {}),
      };
    } catch (error) {
      logger.error({ error, userId, amountMicrousd }, 'Error in deductCredits');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async settleCreditsDurably(
    operation: CreditSettlementOperation,
    db: DatabaseAdapter,
  ): Promise<CreditSettlementResult> {
    const amountMicrousd = resolveSettlementMicrousd(operation);
    const retryResult = await retryWithBackoff(
      async () => {
        const rows = await db.query<Record<string, unknown>>(
          `select
             settlement_status as status,
             deduction_success as success,
             remaining_microusd,
             error_code as code,
             error_message as error,
             attempts as attempt_count
           from enqueue_credit_settlement_microusd($1, $2, $3, $4, $5)`,
          [
            operation.userId,
            amountMicrousd,
            operation.description ?? null,
            JSON.stringify(operation.metadata ?? {}),
            operation.idempotencyKey,
          ],
        );
        return parseSettlementResult(rows[0]);
      },
      {
        maxRetries: 2,
        initialDelayMs: 50,
        maxDelayMs: 200,
        jitter: true,
        isRetryable: isRetryableSettlementTransportError,
        onRetry: (error, attempt, delayMs) => {
          logger.warn(
            {
              event: 'credit_settlement_inline_retry',
              error,
              userId: operation.userId,
              idempotencyKey: operation.idempotencyKey,
              attempt,
              delayMs,
            },
            'Retrying transient credit settlement transport failure',
          );
        },
      },
    );

    if (!retryResult.success || !retryResult.data) {
      logger.error(
        {
          event: 'credit_settlement_unrecorded',
          error: retryResult.error,
          userId: operation.userId,
          idempotencyKey: operation.idempotencyKey,
          amountMicrousd,
          attempts: retryResult.attempts,
        },
        'Credit settlement could not be persisted after inline retries',
      );
      throw new CreditSettlementUnavailableError(retryResult.error);
    }

    const result = retryResult.data;
    if (result.status === 'pending') {
      logger.warn(
        {
          event: 'credit_settlement_queued',
          userId: operation.userId,
          idempotencyKey: operation.idempotencyKey,
          amountMicrousd,
          code: result.code,
          attemptCount: result.attempt_count,
        },
        'Credit settlement persisted for background retry',
      );
    } else if (result.status === 'terminal') {
      logger.error(
        {
          event: 'credit_settlement_terminal',
          userId: operation.userId,
          idempotencyKey: operation.idempotencyKey,
          amountMicrousd,
          code: result.code,
          error: result.error,
          attemptCount: result.attempt_count,
        },
        'Credit settlement reached a terminal state',
      );
    }

    return result;
  }

  static async processPendingSettlements(
    batchSize: number,
    db: DatabaseAdapter,
  ): Promise<CreditSettlementQueueSummary> {
    const boundedBatchSize = Math.max(1, Math.min(Math.trunc(batchSize), 500));
    const rows = await db.query<{
      job_id: string;
      settlement_status: 'succeeded' | 'pending' | 'terminal';
      error_code: string | null;
      attempts: number;
    }>('select * from process_credit_settlement_queue($1)', [boundedBatchSize]);

    const summary: CreditSettlementQueueSummary = {
      processed: rows.length,
      succeeded: 0,
      pending: 0,
      terminal: 0,
    };
    for (const row of rows) {
      if (row.settlement_status === 'succeeded') summary.succeeded += 1;
      else if (row.settlement_status === 'pending') summary.pending += 1;
      else if (row.settlement_status === 'terminal') summary.terminal += 1;
      else {
        throw new Error(`Unexpected credit settlement status: ${String(row.settlement_status)}`);
      }
    }

    logger.info(
      { event: 'credit_settlement_queue_processed', ...summary },
      'Processed durable credit settlement queue',
    );
    return summary;
  }

  static generateIdempotencyKey(
    userId: string,
    operationType: 'reservation' | 'reconciliation' | 'refund',
    requestId: string,
  ): string {
    return `${userId}:${operationType}:${requestId}`;
  }

  static async carryUsageIntoUpgradedPeriod(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    allocationDeltaCents: number,
    db: DatabaseAdapter,
  ): Promise<string> {
    return this.carryUsageIntoUpgradedPeriodMicrousd(
      userId,
      subscriptionId,
      periodStart,
      periodEnd,
      microusdFromLedgerCents(allocationDeltaCents),
      db,
    );
  }

  static async carryUsageIntoUpgradedPeriodMicrousd(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    allocationDeltaMicrousd: number,
    db: DatabaseAdapter,
  ): Promise<string> {
    const allocationDelta = Math.round(allocationDeltaMicrousd);
    // The receipt key stays in cents so an upgrade already recorded before the
    // microUSD ledger landed is still recognised and not applied a second time.
    const upgradeAllocationKey = [
      subscriptionId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      ledgerCentsFromMicrousd(allocationDelta),
    ].join(':');
    const [row] = await db.query<{ account_id: string }>(
      `with current_account as (
         select id
         from token_credits
         where user_id = $1 and subscription_id = $2
         order by period_end desc
         limit 1
         for update
       ), carried as (
         update token_credits
         set period_start = $3,
             period_end = $4,
             credits_allocated_microusd = token_credits.credits_allocated_microusd + $5,
             credits_allocated_cents = public.microusd_to_cents_mirror(
               token_credits.credits_allocated_microusd + $5
             ),
             updated_at = now()
         from current_account
         where token_credits.id = current_account.id
           and not exists (
             select 1
             from credit_transactions receipt
             where receipt.user_id = $1
               and receipt.credit_account_id = current_account.id
               and receipt.transaction_type = 'adjustment'
               and receipt.metadata->>'upgrade_allocation_key' = $6
           )
         returning token_credits.id as account_id
       ), logged as (
         insert into credit_transactions (
           user_id, credit_account_id, transaction_type,
           amount_microusd, amount_cents, description, metadata
         )
         select $1, carried.account_id, 'adjustment',
                $5, public.microusd_to_cents_mirror($5),
                'paid plan upgrade allocation',
                jsonb_build_object('upgrade_allocation_key', $6)
         from carried
         returning credit_account_id as account_id
       )
       select account_id from logged
       union all
       select id as account_id from current_account
       limit 1`,
      [
        userId,
        subscriptionId,
        periodStart.toISOString(),
        periodEnd.toISOString(),
        allocationDelta,
        upgradeAllocationKey,
      ],
    );

    if (!row?.account_id) {
      throw new Error('No credit account found for paid-plan upgrade');
    }
    return row.account_id;
  }

  static async getOrCreateAccount(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
    db: DatabaseAdapter,
  ): Promise<string> {
    return this.getOrCreateAccountMicrousd(
      userId,
      subscriptionId,
      periodStart,
      periodEnd,
      microusdFromLedgerCents(creditsAllocatedCents),
      db,
    );
  }

  static async getOrCreateAccountMicrousd(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedMicrousd: number,
    db: DatabaseAdapter,
  ): Promise<string> {
    try {
      const [row] = await db.query<{ get_or_create_credit_account_microusd: string }>(
        `select get_or_create_credit_account_microusd($1, $2, $3, $4, $5)
                  as get_or_create_credit_account_microusd`,
        [
          userId,
          subscriptionId,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          Math.round(creditsAllocatedMicrousd),
        ],
      );
      return row?.get_or_create_credit_account_microusd ?? '';
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
    db: DatabaseAdapter,
  ): Promise<string> {
    return this.resetForPeriodMicrousd(
      userId,
      subscriptionId,
      periodStart,
      periodEnd,
      microusdFromLedgerCents(creditsAllocatedCents),
      db,
    );
  }

  static async resetForPeriodMicrousd(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedMicrousd: number,
    db: DatabaseAdapter,
  ): Promise<string> {
    try {
      const [row] = await db.query<{ reset_credits_for_period_microusd: string }>(
        `select reset_credits_for_period_microusd($1, $2, $3, $4, $5)
                  as reset_credits_for_period_microusd`,
        [
          userId,
          subscriptionId,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          Math.round(creditsAllocatedMicrousd),
        ],
      );
      return row?.reset_credits_for_period_microusd ?? '';
    } catch (error) {
      logger.error({ error, userId, subscriptionId }, 'Error in resetForPeriod');
      throw error;
    }
  }
}
