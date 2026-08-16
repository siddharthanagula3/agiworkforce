
import type { NextFunction, Request, Response } from 'express';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { getUserScopedClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

declare global {
  namespace Express {
    interface Request {
      planTier?: string;
    }
  }
}

export async function requireManagedChatPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const userDb = getUserScopedClient({ userId: user.userId, token: user.token });
    const { data: subscription, error } = await userDb
      .from('subscriptions')
      .select('plan_tier')
      .eq('user_id', user.userId)
      .maybeSingle();

    if (error) {
      logger.error(
        { error, userId: user.userId },
        'Plan gate: failed to fetch subscription from DB',
      );
      res.status(503).json({
        error: 'Service temporarily unavailable. Please try again shortly.',
        code: 'PLAN_CHECK_UNAVAILABLE',
      });
      return;
    }

    const tier = subscription?.plan_tier ?? 'free';

    const requiredCapability = user.surface === 'developer' ? 'developer_surfaces' : 'managed_chat';

    if (!canUseBillingPlanCapability(tier, requiredCapability)) {
      res.status(403).json(
        user.surface === 'developer'
          ? {
              error: 'Managed Cloud CLI and IDE access require Pro or higher.',
              code: 'developer_surface_plan_required',
              upgrade_url: '/dashboard/billing',
            }
          : {
              error: 'Managed chat is not available for this plan.',
              upgrade_url: '/dashboard/billing',
            },
      );
      return;
    }

    req.planTier = tier;
    next();
  } catch (err) {
    logger.error({ err, userId: user.userId }, 'Plan gate: unexpected error');
    res.status(503).json({
      error: 'Service temporarily unavailable. Please try again shortly.',
      code: 'PLAN_CHECK_UNAVAILABLE',
    });
  }
}
