/**
 * Usage Budget Enforcement Service
 *
 * This layer enforces the shared credit wallet for usage-priced requests.
 * Public exports keep the old "token" names for compatibility, but the
 * underlying contract is cents-based credits against the current billing
 * period budget.
 *
 * Security Features:
 * - Atomic balance checks
 * - Server-side wallet enforcement
 * - Audit trail through shared credit RPCs
 * - Billing-period budget tracking
 */

import { supabase } from '@shared/lib/supabase-client';
import { logger } from '@shared/lib/logger';
import { getModelMetadataById, getProviderConfig, normalizeModelId } from '@agiworkforce/types';

// RPC/tables not yet in generated Database type

const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
import { captureError } from '@shared/lib/sentry';

export interface TokenCheckResult {
  allowed: boolean;
  currentBalance: number;
  estimatedCost: number;
  reason?: string;
}

export interface TokenDeductionResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

export interface UsageMetadata {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionId?: string;
  feature?: string;
}

interface UsageCostEstimate {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface UsageBudgetSnapshot {
  remaining: number;
  allocated: number;
  periodEnd: Date | null;
}

const FALLBACK_PRICING = {
  inputCostPer1MTokens: 1.0,
  outputCostPer1MTokens: 4.0,
};

function normalizeProviderId(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'grok') return 'xai';
  return normalized;
}

function extractCreditsRemainingCents(value: unknown): {
  remaining: number;
  allocated?: number;
  periodEnd?: Date | null;
} {
  if (typeof value === 'number') {
    return { remaining: Math.max(value, 0) };
  }

  if (value && typeof value === 'object') {
    const row = value as {
      credits_remaining_cents?: number;
      credits_allocated_cents?: number;
      period_end?: string | null;
    };
    return {
      remaining: Math.max(Number(row.credits_remaining_cents ?? 0), 0),
      allocated:
        row.credits_allocated_cents !== undefined
          ? Math.max(Number(row.credits_allocated_cents), 0)
          : undefined,
      periodEnd: row.period_end ? new Date(row.period_end) : null,
    };
  }

  return { remaining: 0 };
}

export function estimateUsageCostCents({
  provider,
  model,
  inputTokens,
  outputTokens,
}: UsageCostEstimate): number {
  const normalizedModel = normalizeModelId(model);
  const canonicalProvider = normalizeProviderId(provider);
  const metadata = getModelMetadataById(normalizedModel);
  const providerConfig = getProviderConfig(canonicalProvider);
  const inputCostPer1MTokens =
    metadata?.inputCost ??
    providerConfig?.defaultPricing?.inputPerMillion ??
    FALLBACK_PRICING.inputCostPer1MTokens;
  const outputCostPer1MTokens =
    metadata?.outputCost ??
    providerConfig?.defaultPricing?.outputPerMillion ??
    FALLBACK_PRICING.outputCostPer1MTokens;

  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * inputCostPer1MTokens;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * outputCostPer1MTokens;
  return Math.round((inputCost + outputCost) * 100);
}

async function getUserUsageBudgetSnapshot(userId: string): Promise<UsageBudgetSnapshot | null> {
  try {
    const { data: rpcData, error: rpcError } = await db.rpc('get_credit_balance', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      const balanceRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const extracted = extractCreditsRemainingCents(balanceRow);
      return {
        remaining: extracted.remaining,
        allocated: extracted.allocated ?? 0,
        periodEnd: extracted.periodEnd ?? null,
      };
    }

    if (rpcError) {
      logger.warn('[Usage Budget] get_credit_balance RPC failed, falling back:', rpcError.message);
    }

    const { data: creditsData, error: creditsError } = await db
      .from('token_credits')
      .select('credits_remaining_cents, credits_allocated_cents, period_end')
      .eq('user_id', userId)
      .gt('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creditsError) {
      logger.error('[Usage Budget] Error fetching credit balance:', creditsError.message);
      return null;
    }

    if (!creditsData) {
      logger.warn('[Usage Budget] No active credit account found for user:', userId);
      return null;
    }

    const extracted = extractCreditsRemainingCents(creditsData);
    return {
      remaining: extracted.remaining,
      allocated: extracted.allocated ?? 0,
      periodEnd: extracted.periodEnd ?? null,
    };
  } catch (error) {
    logger.error('[Usage Budget] Error loading balance snapshot:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'get_usage_budget_snapshot' },
      extra: { userId },
    });
    return null;
  }
}

/**
 * Check if user has sufficient credits for an operation.
 * MUST be called BEFORE making any usage-priced request.
 */
export async function checkTokenSufficiency(
  userId: string,
  estimatedCostCents: number,
): Promise<TokenCheckResult> {
  try {
    // Compatibility name retained; actual unit is credits/cents.
    const currentBalance = await getUserTokenBalance(userId);

    if (currentBalance === null) {
      return {
        allowed: false,
        currentBalance: 0,
        estimatedCost: estimatedCostCents,
        reason: 'Failed to fetch usage budget balance',
      };
    }

    // Check if user has sufficient balance
    if (currentBalance < estimatedCostCents) {
      return {
        allowed: false,
        currentBalance,
        estimatedCost: estimatedCostCents,
        reason: `Insufficient credits. You need ${estimatedCostCents.toLocaleString()} credits, but only have ${currentBalance.toLocaleString()} remaining.`,
      };
    }

    return {
      allowed: true,
      currentBalance,
      estimatedCost: estimatedCostCents,
    };
  } catch (error) {
    logger.error('[Token Enforcement] Error checking sufficiency:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'check_token_sufficiency' },
      extra: { userId, estimatedCostCents },
    });
    return {
      allowed: false,
      currentBalance: 0,
      estimatedCost: estimatedCostCents,
      reason: 'System error checking usage budget balance',
    };
  }
}

/**
 * Deduct usage credits from the active billing-period wallet after an API call.
 * Public name is retained for compatibility with older imports.
 */
export async function deductTokens(
  userId: string,
  metadata: UsageMetadata,
): Promise<TokenDeductionResult> {
  try {
    const { provider, model } = metadata;
    const usageCostCents = estimateUsageCostCents({
      provider,
      model,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
    });

    const { data, error: creditError } = await db.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount_cents: usageCostCents,
      p_description: `${provider}/${model} usage`,
      p_metadata: {
        provider,
        model,
        usage_cost_cents: usageCostCents,
        input_tokens: metadata.inputTokens,
        output_tokens: metadata.outputTokens,
        total_tokens: metadata.totalTokens,
        session_id: metadata.sessionId ?? null,
        feature: metadata.feature ?? 'chat',
      },
      p_idempotency_key: `${userId}:${metadata.sessionId ?? 'sessionless'}:${provider}:${model}:${metadata.inputTokens}:${metadata.outputTokens}`,
    });

    if (!creditError) {
      const deductionRow = Array.isArray(data) ? data[0] : data;
      const newBalance =
        typeof deductionRow?.remaining_cents === 'number'
          ? Math.max(deductionRow.remaining_cents, 0)
          : ((await getUserTokenBalance(userId)) ?? 0);
      logger.info(
        `[Usage Budget] Deducted ${usageCostCents} credits from user ${userId}. New balance: ${newBalance}`,
      );

      return {
        success: true,
        newBalance,
      };
    }

    logger.error('[Usage Budget] Error deducting credits:', creditError);
    return {
      success: false,
      newBalance: 0,
      error: `Credit deduction failed: ${creditError.message}`,
    };
  } catch (error) {
    logger.error('[Usage Budget] Error:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'deduct_usage_credits' },
      extra: { userId, ...metadata },
    });
    return {
      success: false,
      newBalance: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get user's current active billing-period credit balance in cents.
 * Public name is retained for compatibility.
 */
export async function getUserTokenBalance(userId: string): Promise<number | null> {
  const snapshot = await getUserUsageBudgetSnapshot(userId);
  return snapshot?.remaining ?? null;
}

/**
 * Estimate tokens for a request (rough estimate)
 * Better to overestimate than underestimate
 */
export function estimateTokensForRequest(
  messageLength: number,
  conversationHistory: number = 0,
): number {
  // Rough estimate: 1 token ≈ 4 characters
  const inputEstimate = Math.ceil((messageLength + conversationHistory) / 4);

  // Assume response will be similar length (overestimate for safety)
  const outputEstimate = inputEstimate * 2;

  return inputEstimate + outputEstimate;
}

/**
 * Check the current billing-period usage budget.
 * This is Cursor-style: one included usage budget per active billing period.
 */
export async function checkMonthlyAllowance(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  resetDate: Date;
}> {
  try {
    const snapshot = await getUserUsageBudgetSnapshot(userId);
    if (!snapshot) {
      return {
        allowed: false,
        used: 0,
        limit: 0,
        resetDate: new Date(),
      };
    }

    const limit = Math.max(snapshot.allocated, 0);
    const used = Math.max(limit - snapshot.remaining, 0);
    const resetDate = snapshot.periodEnd ?? new Date();

    return {
      allowed: limit > 0 && used < limit,
      used,
      limit,
      resetDate,
    };
  } catch (error) {
    logger.error('[Usage Budget] Error checking allowance:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'check_billing_period_allowance' },
      extra: { userId },
    });
    return {
      allowed: false,
      used: 0,
      limit: 0,
      resetDate: new Date(),
    };
  }
}

/**
 * Compatibility helper for older callers. The input value is treated as a
 * credit estimate in cents against the active billing-period budget.
 */
export async function canUserMakeRequest(
  userId: string,
  estimatedTokens: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const allowance = await checkMonthlyAllowance(userId);
  if (!allowance.allowed) {
    return {
      allowed: false,
      reason: `Usage budget exhausted for this billing period. You've used ${allowance.used.toLocaleString()} of your ${allowance.limit.toLocaleString()} credits. Budget resets ${allowance.resetDate.toLocaleDateString()}. Upgrade your plan or add credits to continue.`,
    };
  }

  const sufficiency = await checkTokenSufficiency(userId, estimatedTokens);
  if (!sufficiency.allowed) {
    return {
      allowed: false,
      reason:
        sufficiency.reason ||
        `Insufficient credits. You need ${estimatedTokens.toLocaleString()} credits, but only have ${sufficiency.currentBalance.toLocaleString()} remaining.`,
    };
  }

  return { allowed: true };
}

export async function canUserMakeUsagePricedRequest(
  userId: string,
  estimate: UsageCostEstimate,
): Promise<{ allowed: boolean; reason?: string; estimatedCostCents?: number }> {
  const estimatedCostCents = estimateUsageCostCents(estimate);
  const sufficiency = await checkTokenSufficiency(userId, estimatedCostCents);

  if (!sufficiency.allowed) {
    return {
      allowed: false,
      estimatedCostCents,
      reason:
        sufficiency.reason ||
        `Insufficient credits. You need ${estimatedCostCents.toLocaleString()} credits, but only have ${sufficiency.currentBalance.toLocaleString()} remaining.`,
    };
  }

  return { allowed: true, estimatedCostCents };
}
