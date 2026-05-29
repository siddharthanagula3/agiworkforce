import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';

interface HealthCheck {
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

export async function GET(request: NextRequest) {
  // Rate limiting: 30 requests per minute per IP to prevent enumeration
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const checks: HealthCheck['checks'] = {
    database: { status: 'unhealthy' },
    stripe: { status: 'unhealthy' },
    environment: { status: 'unhealthy' },
  };

  // Check environment variables — require at least one Neon connection string
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

      // Simple API call to check connectivity
      await stripe.products.list({ limit: 1 });
      checks.stripe.status = 'healthy';
    } else {
      checks.stripe.message = 'unavailable';
    }
  } catch (error) {
    checks.stripe.status = 'unhealthy';
    checks.stripe.message = 'unavailable';
    logger.error({ error }, 'Stripe health check failed');
  }

  // Determine overall status
  const allHealthy =
    checks.database.status === 'healthy' &&
    checks.stripe.status === 'healthy' &&
    checks.environment.status === 'healthy';

  const anyUnhealthy =
    checks.database.status === 'unhealthy' ||
    checks.stripe.status === 'unhealthy' ||
    checks.environment.status === 'unhealthy';

  const status: HealthCheck['status'] = allHealthy
    ? 'healthy'
    : anyUnhealthy
      ? 'unhealthy'
      : 'degraded';

  const healthCheck: HealthCheck = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  return NextResponse.json(healthCheck, {
    status: statusCode,
    headers: getCorsHeaders(request),
  });
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
