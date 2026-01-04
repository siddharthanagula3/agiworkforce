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
  code?: string; // 'DAILY_CREDIT_LIMIT_REACHED' | 'MONTHLY_CREDIT_LIMIT_REACHED'
  available?: number;
  required?: number;
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
}

export class CreditService {
  /**
   * Calculate daily limit (30% of monthly credits)
   */
  static getDailyLimit(monthlyCents: number): number {
    return Math.floor(monthlyCents * 0.3);
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
   */
  static async checkAvailable(userId: string, amountCents: number): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('check_credits_available', {
        p_user_id: userId,
        p_amount_cents: amountCents,
      });

      if (error) {
        logger.error({ error, userId, amountCents }, 'Failed to check credits');
        throw error;
      }

      return data === true;
    } catch (error) {
      logger.error({ error, userId, amountCents }, 'Error in checkAvailable');
      return false;
    }
  }

  /**
   * Deduct credits atomically
   */
  static async deductCredits(
    userId: string,
    amountCents: number,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<DeductCreditsResult> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_description: description || null,
        p_metadata: metadata || {},
      });

      if (error) {
        logger.error({ error, userId, amountCents }, 'Failed to deduct credits');
        throw error;
      }

      return data as DeductCreditsResult;
    } catch (error) {
      logger.error({ error, userId, amountCents }, 'Error in deductCredits');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
