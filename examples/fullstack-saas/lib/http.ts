import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

type ApiHandler = (request: NextRequest) => Promise<NextResponse>;

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_SECONDS = 60;

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (env.allowedOrigins.length > 0 && !env.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function optionsResponse(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return json({ error: 'authentication_required' }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return json({ error: 'validation_error', issues: error.issues }, { status: 422 });
  }

  logger.error({ error }, 'api route failed');
  return json({ error: 'internal_server_error' }, { status: 500 });
}

export function withApiGuard(
  handler: ApiHandler,
  opts?: { limit?: number; windowSeconds?: number },
): ApiHandler {
  return async (request) => {
    if (request.method === 'OPTIONS') return optionsResponse(request);

    const ip = getClientIp(request);
    const result = await rateLimit({
      key: `${request.nextUrl.pathname}:${ip}`,
      limit: opts?.limit ?? DEFAULT_LIMIT,
      windowSeconds: opts?.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
    });

    if (!result.allowed) {
      return json(
        { error: 'rate_limited' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            ...corsHeaders(request),
          },
        },
      );
    }

    try {
      const response = await handler(request);
      Object.entries(corsHeaders(request)).forEach(([key, value]) =>
        response.headers.set(key, value),
      );
      response.headers.set('X-RateLimit-Remaining', String(result.remaining));
      return response;
    } catch (error) {
      return apiError(error);
    }
  };
}
