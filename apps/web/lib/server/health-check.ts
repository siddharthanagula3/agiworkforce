import 'server-only';

import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { STRIPE_CLIENT_OPTIONS } from '@/lib/stripe-config';
import { getConfiguredStripePriceIds } from '@/lib/price-tier-mapping';
import {
  cachedRenderInput,
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
} from '@/lib/server/render-cache';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    stripe: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    environment: {
      status: 'healthy' | 'unhealthy';
      missingCount?: number;
    };
  };
}

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {
    database: { status: 'unhealthy' },
    stripe: { status: 'unhealthy' },
    environment: { status: 'unhealthy' },
  };

  const neonEnvVars = ['DATABASE_URL', 'AGI_DATABASE_URL'];
  const missingEnvVars = neonEnvVars.filter((key) => !process.env[key]);
  if (missingEnvVars.length < neonEnvVars.length) {
    checks.environment.status = 'healthy';
  } else {
    checks.environment.missingCount = missingEnvVars.length;
    logger.warn({ missingEnvVars }, 'Health check: missing Neon environment variables');
  }

  try {
    const db = getNeonDb();
    await db.query('select 1');
    checks.database.status = 'healthy';
  } catch (error) {
    checks.database.status = 'unhealthy';
    checks.database.message = 'unavailable';
    logger.error({ error }, 'Database health check failed');
  }

  try {
    const stripeKey = process.env['STRIPE_SECRET_KEY'];

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, STRIPE_CLIENT_OPTIONS);

      await stripe.products.list({ limit: 1 });

      const configuredPriceIds = getConfiguredStripePriceIds();
      const configuredPrices = await Promise.all(
        configuredPriceIds.map((priceId) => stripe.prices.retrieve(priceId)),
      );
      const unusablePriceCount = configuredPrices.filter(
        (price) => !price.active || price.type !== 'recurring' || !price.recurring,
      ).length;
      if (unusablePriceCount > 0) {
        throw new Error(
          `${unusablePriceCount} configured Stripe Price(s) are not active recurring Prices`,
        );
      }

      checks.stripe.status = 'healthy';
    } else {
      checks.stripe.message = 'unavailable';
    }
  } catch (error) {
    checks.stripe.status = 'unhealthy';
    checks.stripe.message = 'unavailable';
    logger.error({ error }, 'Stripe health check failed');
  }

  const coreHealthy =
    checks.database.status === 'healthy' && checks.environment.status === 'healthy';

  const status: HealthCheckResult['status'] = !coreHealthy
    ? 'unhealthy'
    : checks.stripe.status === 'healthy'
      ? 'healthy'
      : 'degraded';

  return {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * The status page's copy of the checks, computed once per window for everyone.
 *
 * `runHealthChecks` opens a database connection and makes 1 + N Stripe API
 * calls (`products.list` plus one `prices.retrieve` per configured price). The
 * answer is the same for every visitor, so running it per page view turned a
 * public page into a traffic-proportional load generator against Stripe and
 * Neon: a crawler or an incident-driven refresh storm hits hardest exactly
 * when those dependencies are least able to take it.
 *
 * `timestamp` in the result is the moment the checks actually ran, and the page
 * shows it, so a cached answer never claims to be more current than it is.
 */
export const getCachedHealthChecks = cachedRenderInput(runHealthChecks, {
  keyParts: ['status-page', 'health-checks'],
  tags: [RENDER_CACHE_TAGS.statusHealth],
  revalidate: RENDER_CACHE_SECONDS.liveSignal,
});
