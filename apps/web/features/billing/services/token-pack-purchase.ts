import { captureError } from '@shared/lib/sentry';
import { logger } from '@shared/lib/logger';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { getAuthToken } from '@shared/lib/get-auth-token';

interface BuyTokenPackParams {
  userId: string;
  userEmail: string;
  packId: string;
  tokens: number;
  price: number;
}

/**
 * Buy Token Pack Service
 *
 * Creates a Stripe checkout session for one-time token pack purchases.
 * Redirects user to Stripe hosted checkout page.
 *
 * UPDATED: January 17, 2026 - Added authorization header
 */
export async function buyTokenPack(params: BuyTokenPackParams): Promise<void> {
  const { userId, packId, tokens, price } = params;

  // Get auth token first
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to purchase tokens.');
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      logger.info('[Buy Token Pack] Initiating purchase:', {
        userId,
        packId,
        tokens: tokens.toLocaleString(),
        price: `$${price}`,
      });
    }

    // Create Stripe checkout session for token pack via API
    // Server expects amount_cents (not price in dollars), and requires CSRF headers
    const response = await fetch('/api/credit-topup', {
      method: 'POST',
      headers: await addCsrfHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      }),
      body: JSON.stringify({
        amount_cents: Math.round(price * 100),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const data = await response.json();

    if (process.env.NODE_ENV === 'development') {
      logger.info('[Buy Token Pack] Checkout session created:', data.sessionId);
    }

    // Redirect to Stripe checkout
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (error) {
    logger.error('[Buy Token Pack] Error:', error);
    captureError(error as Error, {
      tags: { feature: 'billing', operation: 'buy_token_pack' },
      extra: { userId, packId, tokens, price },
    });
    throw error;
  }
}

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
