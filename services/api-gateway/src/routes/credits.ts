/**
 * @file Credits API Routes
 * @security
 * - Rate limiting: Applied per-endpoint based on financial sensitivity
 * - Authentication: JWT required for all endpoints
 * - Privacy: Public responses contain percentage/reset status only
 *
 * Rate limit rationale (OWASP compliant):
 * - GET /balance: 10/min - read operation, moderate limit
 * - POST /check: 10/min - retired compatibility response
 * - POST /deduct: 5/min - retired compatibility response
 */

import { Router, type Request, type Response } from 'express';
import type { ManagedUsageBalance } from '@agiworkforce/types';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

const EMPTY_PUBLIC_USAGE_BALANCE: ManagedUsageBalance = Object.freeze({
  usage_percentage: 0,
  reset_at: null,
  seconds_until_reset: 0,
  has_usage_remaining: false,
});

function asNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function asIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Keep private ledger operands inside the service boundary. */
function toPublicUsageBalance(balance: Record<string, unknown> | null): ManagedUsageBalance {
  if (!balance?.['account_id']) return { ...EMPTY_PUBLIC_USAGE_BALANCE };

  const allocated = asNonNegativeNumber(balance['credits_allocated_cents']);
  const used = Math.min(allocated, asNonNegativeNumber(balance['credits_used_cents']));
  const remaining = asNonNegativeNumber(balance['credits_remaining_cents']);
  const resetAt = asIsoTimestamp(balance['period_end']);
  const resetTime = resetAt ? Date.parse(resetAt) : Number.NaN;

  return {
    usage_percentage: allocated > 0 ? Math.round((used / allocated) * 10_000) / 100 : 0,
    reset_at: resetAt,
    seconds_until_reset: Number.isNaN(resetTime)
      ? 0
      : Math.max(0, Math.floor((resetTime - Date.now()) / 1_000)),
    has_usage_remaining: allocated > 0 && remaining > 0,
  };
}

router.use(authenticateToken);
// SECURITY: Baseline rate limit for all credit endpoints (100/min fallback)
router.use(createRateLimiter('default'));

/**
 * GET /api/credits/balance
 * Get current credit balance for the authenticated user
 *
 * SECURITY: Rate limited to 10 requests/minute per user
 */
router.get(
  '/balance',
  createRateLimiter('credits-balance'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // P1-GW-RLS: get_credit_balance runs with caller privileges (no SECURITY
    // DEFINER — 0020_functions.sql), reading public.token_credits, which has
    // RLS enabled+forced with a policy keyed on `user_id =
    // current_app_user_id()` (0037_rls_user_isolation.sql). getUserScopedClient
    // binds the verified token via withUser(), so this RPC now runs under real
    // Postgres RLS as a backstop behind the explicit p_user_id parameter below.
    const userDb = getUserScopedClient({ userId: user.userId, token: user.token });
    const { data, error } = await userDb.rpc('get_credit_balance', {
      p_user_id: user.userId,
    });

    if (error) {
      logger.error({ error }, 'Failed to get credit balance');
      throw new AppError('Failed to get credit balance', 500);
    }

    // The RPC returns an array, get the first row
    const balance = Array.isArray(data) ? data[0] : data;

    res.json(toPublicUsageBalance(balance ?? null));
  },
);

/**
 * Client-supplied ledger amounts are no longer accepted. Managed requests are
 * reserved and settled by the authenticated LLM route after it calculates the
 * provider cost server-side.
 */
function retireClientManagedCreditOperation(_req: Request, res: Response): void {
  res.status(410).json({
    error: 'Client-managed credit operations are no longer available',
    code: 'SERVER_MANAGED_BILLING_REQUIRED',
  });
}

router.post('/check', createRateLimiter('credits-check'), retireClientManagedCreditOperation);
router.post('/deduct', createRateLimiter('credits-deduct'), retireClientManagedCreditOperation);

export { router as creditsRouter };
