/**
 * @file Plan Gate Middleware
 * @security
 * - Enforces subscription tier requirements for cloud model access
 * - Fails closed: any DB error or missing subscription blocks access
 * - Attaches planTier to request for downstream route use
 *
 * The shared billing catalog owns which canonical plans include managed chat.
 */

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

/**
 * Middleware that checks the authenticated user's subscription tier.
 *
 * Prerequisites: `authenticateToken` must have run first — `req.user` must be set.
 *
 * On success: attaches `req.planTier` and calls `next()`.
 * On a non-managed or unknown plan: returns 403 with upgrade_url.
 * A missing subscription row is Free; database errors return 503.
 */
export async function requireManagedChatPlan(
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
    // P1-GW-RLS: `subscriptions` has RLS enabled+forced with a policy keyed on
    // `user_id = current_app_user_id()` (0037_rls_user_isolation.sql), so this
    // now runs through real Postgres RLS via getUserScopedClient's
    // withUser(token) binding — a DB-level backstop behind the `.eq('user_id',
    // …)` filter below, not a replacement for it. Keep the filter.
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
      // Fail closed — do not grant access when we cannot verify the tier.
      res.status(503).json({
        error: 'Service temporarily unavailable. Please try again shortly.',
        code: 'PLAN_CHECK_UNAVAILABLE',
      });
      return;
    }

    const tier = subscription?.plan_tier ?? 'free';

    // Bind the required capability to the TRUSTED surface class (from the
    // verified token issuer in auth.ts), not a caller header. Developer
    // surfaces (CLI/IDE device tokens) require Pro-or-higher
    // `developer_surfaces`; app surfaces (desktop/mobile) require `managed_chat`.
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
