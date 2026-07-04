import { captureError } from '@shared/lib/sentry';
import { logger } from '@shared/lib/logger';
import { getAuthToken } from '@shared/lib/get-auth-token';

/**
 * Add tokens to user's balance
 *
 * Called by webhook after successful payment.
 * Updates user's token balance in the user_token_balances table.
 *
 * NOTE: Uses user_token_balances table (authoritative source) instead of
 * the deprecated users.token_balance column (dropped in migration 20260113000002).
 */
export async function addTokensToUserBalance(
  userId: string,
  tokens: number,
  transactionId: string,
): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'development') {
      logger.info('[Add Tokens] Adding tokens to user balance:', {
        userId,
        tokens: tokens.toLocaleString(),
        transactionId,
      });
    }

    // Route through the server-side API (Neon SQL removed; Neon is server-only).
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('Not authenticated');
    }

    const res = await fetch('/api/usage/add-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ tokens, transaction_id: transactionId }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `add-tokens failed: ${res.status}`);
    }

    if (process.env.NODE_ENV === 'development') {
      logger.info('[Add Tokens] Token balance updated via API:', { tokensAdded: tokens });
    }
  } catch (error) {
    logger.error('[Add Tokens] Error:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'add_tokens' },
      extra: { userId, tokens, transactionId },
    });
    throw error;
  }
}

/**
 * Get user's token balance
 *
 * NOTE: Uses user_token_balances table (authoritative source) instead of
 * the deprecated users.token_balance column (dropped in migration 20260113000002).
 */
export async function getUserTokenBalance(_userId: string): Promise<number> {
  try {
    const authToken = await getAuthToken();
    if (!authToken) return 0;

    const res = await fetch('/api/usage', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return 0;

    const body = (await res.json()) as Record<string, unknown>;
    return typeof body['credits_remaining_cents'] === 'number'
      ? body['credits_remaining_cents']
      : 0;
  } catch (error) {
    logger.error('[Get Token Balance] Error:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'get_token_balance' },
      extra: { _userId },
      level: 'warning',
    });
    return 0;
  }
}

// Note: isStripeConfigured() is exported from stripe-payments.ts · do not duplicate here.
