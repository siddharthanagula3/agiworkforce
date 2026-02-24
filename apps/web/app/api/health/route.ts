import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';

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

  // Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingEnvVars.length === 0) {
    checks.environment.status = 'healthy';
  } else {
    // Security: Only expose count, not names (prevents information disclosure)
    checks.environment.missingCount = missingEnvVars.length;
    // Log the actual missing vars server-side for debugging
    logger.warn({ missingEnvVars }, 'Health check: missing environment variables');
  }

  // Check database connectivity
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });

      // Simple query to check connectivity
      const { error } = await supabase.from('subscriptions').select('id').limit(1);

      if (!error || error.code === 'PGRST116') {
        // PGRST116 is "not found" which is fine for health check
        checks.database.status = 'healthy';
      } else {
        checks.database.status = 'unhealthy';
        checks.database.message = 'unavailable';
        logger.error({ error: error.message }, 'Database health check query failed');
      }
    } else {
      checks.database.message = 'unavailable';
    }
  } catch (error) {
    checks.database.status = 'unhealthy';
    checks.database.message = 'unavailable';
    logger.error({ error }, 'Database health check failed');
  }

  // Check Stripe connectivity
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, {
        apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
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
