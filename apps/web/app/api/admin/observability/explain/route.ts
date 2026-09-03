import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { explainManagedUsageRequest } from '@/lib/services/route-cache-observability-service';

function errorResponse(err: AppError): NextResponse {
  return NextResponse.json(
    { error: { code: err.code, message: err.message } },
    { status: err.statusCode },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;

  try {
    await requirePlatformAdmin(request);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const idempotencyKey = searchParams.get('idempotencyKey');
    if (!userId || !idempotencyKey) {
      return errorResponse(createError.badRequest('userId and idempotencyKey are required'));
    }

    const explain = await explainManagedUsageRequest({ userId, idempotencyKey });
    if (!explain) {
      return errorResponse(createError.notFound('No managed usage request matched'));
    }

    return NextResponse.json({ explain });
  } catch (error) {
    if (isAppError(error)) return errorResponse(error);
    logger.error({ error }, 'Route and cache observability explain read failed');
    if (isDbUnavailableError(error)) {
      return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'));
    }
    return errorResponse(createError.internal());
  }
}
