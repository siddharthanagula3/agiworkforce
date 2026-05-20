import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getRedis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'skipped' | 'error'> = {
    app: 'ok',
    redis: 'skipped',
    supabase: 'skipped',
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }
  }

  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.supabaseAnonKey },
      signal: AbortSignal.timeout(2500),
    });
    checks.supabase = response.ok ? 'ok' : 'error';
  } catch {
    checks.supabase = 'error';
  }

  const healthy = Object.values(checks).every((check) => check === 'ok' || check === 'skipped');

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
