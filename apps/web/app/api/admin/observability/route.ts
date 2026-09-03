import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import {
  getObservabilityBreakdown,
  resolveObservabilityWindow,
  type ObservabilityDimension,
} from '@/lib/services/route-cache-observability-service';

const DIMENSIONS: ObservabilityDimension[] = ['route', 'model', 'user', 'tenant'];
const DEFAULT_DIMENSION: ObservabilityDimension = 'route';

function errorResponse(err: AppError): NextResponse {
  return NextResponse.json(
    { error: { code: err.code, message: err.message } },
    { status: err.statusCode },
  );
}

function parseDimension(value: string | null): ObservabilityDimension {
  return DIMENSIONS.includes(value as ObservabilityDimension)
    ? (value as ObservabilityDimension)
    : DEFAULT_DIMENSION;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;

  try {
    await requirePlatformAdmin(request);

    const { searchParams } = new URL(request.url);
    const dimension = parseDimension(searchParams.get('dimension'));
    const { from, to } = resolveObservabilityWindow(
      searchParams.get('from'),
      searchParams.get('to'),
    );

    const rows = await getObservabilityBreakdown(dimension, from, to);

    return NextResponse.json({
      dimension,
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
    });
  } catch (error) {
    if (isAppError(error)) return errorResponse(error);
    logger.error({ error }, 'Route and cache observability read failed');
    if (isDbUnavailableError(error)) {
      return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'));
    }
    return errorResponse(createError.internal());
  }
}
