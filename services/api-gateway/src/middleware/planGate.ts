/**
 * @file Plan Gate Middleware
 * @security
 * - Enforces subscription tier requirements for cloud model access
 * - Fails closed: any DB error or missing subscription blocks access
 * - Attaches planTier to request for downstream route use
 *
 * Tier hierarchy: free < hobby < pro < max < enterprise
 * Cloud models require hobby or above.
 */

import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

/**
 * Subscription tiers that are allowed to access cloud models.
 * Hobby plan has limited credits; Pro/Max/Enterprise have full access.
 * Only "free" and unknown tiers are blocked.
 */
const ALLOWED_TIERS = new Set(['hobby', 'pro', 'max', 'enterprise']);

declare global {
  namespace Express {
    interface Request {
      planTier?: string;
    }
  }
}

/**
 * Middleware that checks the authenticated user's subscription tier.
 *
 * Prerequisites: `authenticateToken` must have run first — `req.user` must be set.
 *
 * On success: attaches `req.planTier` and calls `next()`.
 * On free plan: returns 403 with upgrade_url.
 * On DB error or missing subscription: returns 503 (fail closed).
 */
export async function requireProPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;

  if (!user) {
    // Should never reach here if authenticateToken ran first, but guard defensively.
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('plan_tier')
      .eq('user_id', user.userId)
      .single();

    if (error) {
      logger.error(
        { error, userId: user.userId },
        'Plan gate: failed to fetch subscription from DB',
      );
      // Fail closed — do not grant access when we cannot verify the tier.
      res.status(503).json({
        error: 'Service temporarily unavailable. Please try again shortly.',
        code: 'PLAN_CHECK_UNAVAILABLE',
      });
      return;
    }

    const tier: string = subscription?.plan_tier ?? 'free';

    if (!ALLOWED_TIERS.has(tier)) {
      res.status(403).json({
        error: 'Cloud models require a Hobby plan or above. Upgrade to get started.',
        upgrade_url: '/dashboard/billing',
        current_tier: tier,
      });
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
