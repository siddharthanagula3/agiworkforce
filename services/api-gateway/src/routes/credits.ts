
import { Router, type Request, type Response } from 'express';
import {
  effectivePlanTier,
  normalizeBillingPlanTier,
  type ManagedUsageBalance,
} from '@agiworkforce/types';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

const EMPTY_PUBLIC_USAGE_BALANCE: ManagedUsageBalance = Object.freeze({
  usage_percentage: null,
  reset_at: null,
  seconds_until_reset: 0,
  has_usage_remaining: false,
  usage_visible: false,
});

function asNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function asIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPublicUsageBalance(
  balance: Record<string, unknown> | null,
  usageVisible: boolean,
): ManagedUsageBalance {
  if (!balance?.['account_id']) {
    return usageVisible
      ? { ...EMPTY_PUBLIC_USAGE_BALANCE, usage_percentage: 0, usage_visible: true }
      : { ...EMPTY_PUBLIC_USAGE_BALANCE };
  }

  const allocated = asNonNegativeNumber(balance['credits_allocated_cents']);
  const used = Math.min(allocated, asNonNegativeNumber(balance['credits_used_cents']));
  const remaining = asNonNegativeNumber(balance['credits_remaining_cents']);
  const resetAt = asIsoTimestamp(balance['period_end']);
  const resetTime = resetAt ? Date.parse(resetAt) : Number.NaN;

  return {
    usage_percentage:
      usageVisible && allocated > 0 ? Math.round((used / allocated) * 10_000) / 100 : null,
    reset_at: resetAt,
    seconds_until_reset: Number.isNaN(resetTime)
      ? 0
      : Math.max(0, Math.floor((resetTime - Date.now()) / 1_000)),
    has_usage_remaining: allocated > 0 && remaining > 0,
    usage_visible: usageVisible,
  };
}

router.use(authenticateToken);
router.use(createRateLimiter('default'));

router.get(
  '/balance',
  createRateLimiter('credits-balance'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const userDb = getUserScopedClient({ userId: user.userId, token: user.token });
    const [balanceResult, subscriptionResult] = await Promise.all([
      userDb.rpc('get_credit_balance', {
        p_user_id: user.userId,
      }),
      userDb
        .from('subscriptions')
        .select('plan_tier, status')
        .eq('user_id', user.userId)
        .maybeSingle(),
    ]);

    if (balanceResult.error) {
      logger.error({ error: balanceResult.error }, 'Failed to get credit balance');
      throw new AppError('Failed to get credit balance', 500);
    }

    if (subscriptionResult.error) {
      logger.error(
        { error: subscriptionResult.error, userId: user.userId },
        'Failed to determine credit usage visibility',
      );
      throw new AppError('Service temporarily unavailable', 503);
    }

    const subscription = subscriptionResult.data;
    const effectiveTier = normalizeBillingPlanTier(
      effectivePlanTier(subscription?.plan_tier, subscription?.status),
    );
    const usageVisible = effectiveTier !== 'free';

    const balance = Array.isArray(balanceResult.data) ? balanceResult.data[0] : balanceResult.data;

    res.json(toPublicUsageBalance(balance ?? null, usageVisible));
  },
);

function retireClientManagedCreditOperation(_req: Request, res: Response): void {
  res.status(410).json({
    error: 'Client-managed credit operations are no longer available',
    code: 'SERVER_MANAGED_BILLING_REQUIRED',
  });
}

router.post('/check', createRateLimiter('credits-check'), retireClientManagedCreditOperation);
router.post('/deduct', createRateLimiter('credits-deduct'), retireClientManagedCreditOperation);

export { router as creditsRouter };
