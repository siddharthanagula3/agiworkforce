import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

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
   * Get current credit balance for a user
   */
  static async getBalance(userId: string): Promise<CreditBalance | null> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('get_credit_balance', {
        p_user_id: userId,
      });

      if (error) {
        logger.error({ error, userId }, 'Failed to get credit balance');
        throw error;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
      }

      // RPC functions that return TABLE return an array, get the first row
      return data[0] as CreditBalance;
    } catch (error) {
      logger.error({ error, userId }, 'Error in getBalance');
      throw error;
    }
  }

  /**
   * Check if user has enough credits
   * Returns true if user has sufficient credits, false otherwise.
   * On RPC errors, falls back to direct balance check for reliability.
   */
  static async checkAvailable(userId: string, amountCents: number): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('check_credits_available', {
        p_user_id: userId,
        p_amount_cents: amountCents,
      });

      if (error) {
        logger.error(
          { error, userId, amountCents },
          'RPC check_credits_available failed, trying fallback',
        );
        // Fall back to direct balance check
        return this.checkAvailableFallback(userId, amountCents);
      }

      // Handle various boolean representations from PostgreSQL/Supabase
      // PostgreSQL boolean can be returned as: true, false, 't', 'f', 1, 0, 'true', 'false'
      const result = data === true || data === 't' || data === 'true' || data === 1;

      logger.debug(
        { userId, amountCents, rawData: data, result },
        'Credit availability check completed',
      );

      return result;
    } catch (error) {
      logger.error({ error, userId, amountCents }, 'Error in checkAvailable, trying fallback');
      // Fall back to direct balance check instead of failing silently
      return this.checkAvailableFallback(userId, amountCents);
    }
  }

  /**
   * Fallback credit check using direct balance query
   * Used when the RPC function fails (e.g., auth issues, network errors)
   */
  private static async checkAvailableFallback(
    userId: string,
    amountCents: number,
  ): Promise<boolean> {
    try {
      const balance = await this.getBalance(userId);

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
   */
  static async deductCredits(
    userId: string,
    amountCents: number,
    description?: string,
    metadata?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<DeductCreditsResult> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_description: description || null,
        p_metadata: metadata || {},
        p_idempotency_key: idempotencyKey || null,
      });

      if (error) {
        logger.error({ error, userId, amountCents, idempotencyKey }, 'Failed to deduct credits');
        throw error;
      }

      // RPC returns array, get first row
      const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
      return result as DeductCreditsResult;
    } catch (error) {
      logger.error({ error, userId, amountCents, idempotencyKey }, 'Error in deductCredits');
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
   * Get or create credit account for a period
   */
  static async getOrCreateAccount(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    try {
      const supabase = getSupabaseClient();
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
   * Reset credits for a new period
   */
  static async resetForPeriod(
    userId: string,
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
    creditsAllocatedCents: number,
  ): Promise<string> {
    try {
      const supabase = getSupabaseClient();
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
