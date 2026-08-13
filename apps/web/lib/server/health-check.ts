import 'server-only';

import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { getConfiguredStripePriceIds } from '@/lib/price-tier-mapping';

/**
 * Shared hosted-platform health checks.
 *
 * Used by GET /api/health (public endpoint, rate-limited there) and by the
 * /status page, which calls this DIRECTLY instead of HTTP-fetching the API
 * route · building a self-request URL from request headers is a Host-header
 * SSRF vector (flagged by security review 2026-06-11).
 */

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
      // Security: Don't expose which env vars are missing (information disclosure risk)
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

  // Check environment variables · require at least one Neon connection string
  const neonEnvVars = ['DATABASE_URL', 'AGI_DATABASE_URL'];
  const missingEnvVars = neonEnvVars.filter((key) => !process.env[key]);
  if (missingEnvVars.length < neonEnvVars.length) {
    // At least one Neon URL is set
    checks.environment.status = 'healthy';
  } else {
    // Security: Only expose count, not names (prevents information disclosure)
    checks.environment.missingCount = missingEnvVars.length;
    // Log the actual missing vars server-side for debugging
    logger.warn({ missingEnvVars }, 'Health check: missing Neon environment variables');
  }

  // Check database connectivity via Neon
  try {
    const db = getNeonDb();
    await db.query('select 1');
    checks.database.status = 'healthy';
  } catch (error) {
    checks.database.status = 'unhealthy';
    checks.database.message = 'unavailable';
    logger.error({ error }, 'Database health check failed');
  }

  // Check Stripe connectivity
  try {
    const stripeKey = process.env['STRIPE_SECRET_KEY'];

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, {
        apiVersion: STRIPE_API_VERSION,
      });

      // Prove general account connectivity first, then prove that every Price
      // this deployment actively sells is reachable under this exact key and
      // remains active + recurring. A test/live or Stripe-account mismatch can
      // still list products successfully; it fails only when Checkout looks up
      // a live Price with a test key. Checking the configured objects here
      // exposes that drift in deploy/cron/status health before a buyer clicks.
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

  // Overall status: `unhealthy` (503) means the platform cannot serve —
  // database or environment failure. A Stripe failure only degrades billing
  // while chat keeps working, so it reports `degraded` (200); uptime monitors
  // on /api/health must not page a whole-platform outage for it.
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
