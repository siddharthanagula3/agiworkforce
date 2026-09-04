import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
  readCloudCodeNotebookFile,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { servedByteHeaders } from '@/lib/security/served-bytes';

export const runtime = 'nodejs';
export const maxDuration = 600;

type RouteContext = { params: Promise<{ sessionId: string; path: string[] }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.serviceUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
}

async function handleDownload(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'files-serve', `user:${userId}`);
  if (limited) return limited;
  if (!e2bProvisioningReady()) {
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
  }
  const { sessionId, path } = await context.params;
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);
  try {
    const { bytes } = await readCloudCodeNotebookFile(
      db,
      { userId, organizationId },
      sessionId,
      path.map(decodeURIComponent).join('/'),
      planTier,
    );
    const filename = path[path.length - 1] ?? 'file';
    const served = servedByteHeaders({
      contentType: 'application/octet-stream',
      filename,
      forceAttachment: true,
    });
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': served.contentType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': served.contentDisposition,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleDownload);
