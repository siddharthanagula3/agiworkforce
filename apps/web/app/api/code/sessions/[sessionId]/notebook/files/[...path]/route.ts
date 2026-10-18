import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readCloudCodeNotebookFile } from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

export const runtime = 'nodejs';
export const maxDuration = 600;

type RouteContext = { params: Promise<{ sessionId: string; path: string[] }> };

async function handleDownload(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'files-serve', `user:${userId}`);
  if (limited) return limited;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable('Managed Code is not enabled for this deployment');
  }
  const { sessionId, path } = await context.params;
  const entitlement = await resolveEntitlementBundle(db, userId);

  // Reading a file claims the session and provisions the sandbox, so it buys
  // managed compute and answers to the same gate the write paths do.
  const accessGateResponse = buildManagedComputeAccessGateResponse(
    await evaluateManagedComputeAccess(
      db,
      userId,
      entitlement.subscription,
      resolveCloudChatSurface(request),
      {
        request,
      },
    ),
  );
  if (accessGateResponse) return accessGateResponse;

  const planTier = entitlement.plan;
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
