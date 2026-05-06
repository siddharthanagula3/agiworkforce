/**
 * @file credit-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * USER-CONTEXT methods use an overloaded first argument:
 *   - `(client: SupabaseClient, userId, ...)` - pass `getUserClient(jwt)` from caller
 *   - `(userId: string, ...)` - legacy service-context path (no user JWT); uses service-role internally
 *
 * SERVICE-CONTEXT methods (`getOrCreateAccount`, `resetForPeriod`) call `getServiceClient()`
 * internally. They are called only from Stripe webhook and cron handlers.
 *
 * Never add a private `getSupabaseClient()` here. See lib/services/README.md.
 */
import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-server';
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
  last_daily_reset_at?: string; // ISO timestamp
}

export interface DeductCreditsResult {
  success: boolean;
  account_id?: string;
  remaining_cents?: number;
  error?: string;
  code?: string; // 'MONTHLY_CREDIT_LIMIT_REACHED' | 'NO_ACCOUNT'
  available?: number;
  required?: number;
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
}

export class CreditService {
  /**
   * Daily limits are disabled. The current product model uses a single
   * billing-period usage budget, Cursor-style.
   */
  static getDailyLimit(monthlyCents: number): number {
    return monthlyCents;
  }

  /**
   * Get current credit balance for a user.
   *
   * USER-CONTEXT: pass `getUserClient(jwt)` as the `client` argument to enforce RLS.
   * SERVICE-CONTEXT (Stripe webhook, cron): omit `client`; falls back to service-role client.
   */
  static async getBalance(
    clientOrUserId: SupabaseClient | string,
    userId?: string,
  ): Promise<CreditBalance | null> {
    // Overload resolution: (client, userId) or legacy (userId)
    let supabase: SupabaseClient;
    let resolvedUserId: string;
    if (typeof clientOrUserId === 'string') {
      // SERVICE-CONTEXT: legacy call signature (userId only)
      // SECURITY: service-role required because caller has no user JWT (webhook/cron context).
      supabase = getServiceClient();
      resolvedUserId = clientOrUserId;
    } else {
      supabase = clientOrUserId;
      resolvedUserId = userId!;
    }

    try {
      const { data, error } = await supabase.rpc('get_credit_balance', {
        p_user_id: resolvedUserId,
      });

      if (error) {
        logger.error({ error, userId: resolvedUserId }, 'Failed to get credit balance');
        throw error;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
      }

      // RPC functions that return TABLE return an array, get the first row
      return data[0] as CreditBalance;
    } catch (error) {
      logger.error({ error, userId: resolvedUserId }, 'Error in getBalance');
      throw error;
    }
  }

  /**
   * Check if user has enough credits.
   * Returns true if user has sufficient credits, false otherwise.
   * On RPC errors, falls back to direct balance check for reliability.
   *
   * USER-CONTEXT: pass `getUserClient(jwt)` as the `client` argument to enforce RLS.
   * SERVICE-CONTEXT (Stripe webhook, cron): omit `client`; falls back to service-role client.
   */
  static async checkAvailable(
    clientOrUserId: SupabaseClient | string,
    userIdOrAmount: string | number,
    amountCents?: number,
  ): Promise<boolean> {
    // Overload resolution: (client, userId, amountCents) or legacy (userId, amountCents)
    let supabase: SupabaseClient;
    let resolvedUserId: string;
    let resolvedAmount: number;
    if (typeof clientOrUserId === 'string') {
      // SERVICE-CONTEXT: legacy call signature (userId, amountCents)
      // SECURITY: service-role required because caller has no user JWT (webhook/cron context).
      supabase = getServiceClient();
      resolvedUserId = clientOrUserId;
      resolvedAmount = userIdOrAmount as number;
    } else {
      supabase = clientOrUserId;
      resolvedUserId = userIdOrAmount as string;
      resolvedAmount = amountCents!;
    }

    try {
      const { data, error } = await supabase.rpc('check_credits_available', {
        p_user_id: resolvedUserId,
        p_amount_cents: resolvedAmount,
      });

      if (error) {
        logger.error(
          { error, userId: resolvedUserId, amountCents: resolvedAmount },
          'RPC check_credits_available failed, trying fallback',
        );
        // Fall back to direct balance check
        return this.checkAvailableFallback(supabase, resolvedUserId, resolvedAmount);
      }

      // Handle various boolean representations from PostgreSQL/Supabase
      // PostgreSQL boolean can be returned as: true, false, 't', 'f', 1, 0, 'true', 'false'
      const result = data === true || data === 't' || data === 'true' || data === 1;

      logger.debug(
        { userId: resolvedUserId, amountCents: resolvedAmount, rawData: data, result },
        'Credit availability check completed',
      );

      return result;
    } catch (error) {
      logger.error(
        { error, userId: resolvedUserId, amountCents: resolvedAmount },
        'Error in checkAvailable, trying fallback',
      );
      // Fall back to direct balance check instead of failing silently
      return this.checkAvailableFallback(supabase, resolvedUserId, resolvedAmount);
    }
  }

  /**
   * Fallback credit check using direct balance query.
   * Used when the RPC function fails (e.g., auth issues, network errors).
   */
  private static async checkAvailableFallback(
    supabase: SupabaseClient,
    userId: string,
    amountCents: number,
  ): Promise<boolean> {
    try {
      const balance = await this.getBalance(supabase, userId);

      if (!balance || !balance.account_id) {
        logger.warn({ userId }, 'No credit balance found in fallback check');
        return false;
      }

      // Check monthly limit
      if (balance.credits_remaining_cents < amountCents) {
        logger.debug(
          { userId, remaining: balance.credits_remaining_cents, required: amountCents },
          'Insufficient monthly credits (fallback)',
        );
        return false;
      }

      logger.info({ userId, amountCents }, 'Credit check passed via fallback method');
      return true;
    } catch (error) {
      logger.error({ error, userId, amountCents }, 'Fallback credit check also failed');
      // Only return false if we truly can't determine credit availability
      // This is a last resort - the user should see an error rather than being silently blocked
      return false;
    }
  }

  /**
   * Deduct credits atomically with optional idempotency key.
   * When an idempotency key is provided, duplicate requests with the same key
   * will return the cached result instead of deducting credits again.
   * Keys are valid for 24 hours.
   *
   * USER-CONTEXT: pass `getUserClient(jwt)` as the `client` argument to enforce RLS.
   * SERVICE-CONTEXT (Stripe webhook, cron): omit `client`; falls back to service-role client.
   */
  static async deductCredits(
    clientOrUserId: SupabaseClient | string,
    userIdOrAmount: string | number,
    amountCentsOrDescription?: number | string,
    descriptionOrMetadata?: string | Record<string, unknown>,
    metadataOrIdempotencyKey?: Record<string, unknown> | string,
    idempotencyKey?: string,
  ): Promise<DeductCreditsResult> {
    // Overload resolution:
    //   USER-CONTEXT:    (client, userId, amountCents, description?, metadata?, idempotencyKey?)
    //   SERVICE-CONTEXT: (userId, amountCents, description?, metadata?, idempotencyKey?)
    let supabase: SupabaseClient;
    let resolvedUserId: string;
    let resolvedAmountCents: number;
    let resolvedDescription: string | undefined;
    let resolvedMetadata: Record<string, unknown> | undefined;
    let resolvedIdempotencyKey: string | undefined;

    if (typeof clientOrUserId === 'string') {
      // SERVICE-CONTEXT: legacy call signature
      // SECURITY: service-role required because caller has no user JWT (webhook/cron context).
      supabase = getServiceClient();
      resolvedUserId = clientOrUserId;
      resolvedAmountCents = userIdOrAmount as number;
      resolvedDescription = amountCentsOrDescription as string | undefined;
      resolvedMetadata = descriptionOrMetadata as Record<string, unknown> | undefined;
      resolvedIdempotencyKey = metadataOrIdempotencyKey as string | undefined;
    } else {
      // USER-CONTEXT: (client, userId, amountCents, ...)
      supabase = clientOrUserId;
      resolvedUserId = userIdOrAmount as string;
      resolvedAmountCents = amountCentsOrDescription as number;
      resolvedDescription = descriptionOrMetadata as string | undefined;
      resolvedMetadata = metadataOrIdempotencyKey as Record<string, unknown> | undefined;
      resolvedIdempotencyKey = idempotencyKey;
    }

    try {
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: resolvedUserId,
        p_amount_cents: resolvedAmountCents,
        p_description: resolvedDescription || null,
        p_metadata: resolvedMetadata || {},
        p_idempotency_key: resolvedIdempotencyKey || null,
      });

      if (error) {
        logger.error(
          {
            error,
            userId: resolvedUserId,
            amountCents: resolvedAmountCents,
            idempotencyKey: resolvedIdempotencyKey,
          },
          'Failed to deduct credits',
        );
        throw error;
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      return result as DeductCreditsResult;
    } catch (error) {
      logger.error(
        {
          error,
          userId: resolvedUserId,
          amountCents: resolvedAmountCents,
          idempotencyKey: resolvedIdempotencyKey,
        },
        'Error in deductCredits',
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate an idempotency key for a credit operation.
   * Format: {userId}:{operationType}:{uniqueIdentifier}:{timestamp}
   */
  static generateIdempotencyKey(
    userId: string,
    operationType: 'reservation' | 'reconciliation' | 'refund',
    requestId: string,
  ): string {
    return `${userId}:${operationType}:${requestId}`;
  }

  /**
   * Get or create credit account for a period.
   * SERVICE-CONTEXT: called only from SubscriptionService.allocateCreditsForPeriod
   * which is itself SERVICE-CONTEXT (Stripe webhook, claim-offer).
   */
  static async getOrCreateAccount(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    // SECURITY: service-role required because this is called from Stripe webhook and
    // claim-offer handlers where no user JWT is available.
    const supabase = getServiceClient();
    try {
      const { data, error } = await supabase.rpc('get_or_create_credit_account', {
        p_user_id: userId,
        p_subscription_id: subscriptionId,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_credits_allocated_cents: creditsAllocatedCents,
      });

      if (error) {
        logger.error({ error, userId, subscriptionId }, 'Failed to get or create credit account');
        throw error;
      }

      return data as string;
    } catch (error) {
      logger.error({ error, userId, subscriptionId }, 'Error in getOrCreateAccount');
      throw error;
    }
  }

  /**
   * Reset credits for a new period.
   * SERVICE-CONTEXT: called only from SubscriptionService.resetCreditsForNewPeriod
   * which is itself SERVICE-CONTEXT (Stripe webhook, cron).
   */
  static async resetForPeriod(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    // SECURITY: service-role required because this is called from Stripe webhook and
    // cron job where no user JWT is available.
    const supabase = getServiceClient();
    try {
      const { data, error } = await supabase.rpc('reset_credits_for_period', {
        p_user_id: userId,
        p_subscription_id: subscriptionId,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_credits_allocated_cents: creditsAllocatedCents,
      });

      if (error) {
        logger.error({ error, userId, subscriptionId }, 'Failed to reset credits');
        throw error;
      }

      return data as string;
    } catch (error) {
      logger.error({ error, userId, subscriptionId }, 'Error in resetForPeriod');
      throw error;
    }
  }
}
