import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listCloudCodeNotebookFiles,
  writeCloudCodeNotebookFile,
} from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

export const runtime = 'nodejs';
export const maxDuration = 600;

type RouteContext = { params: Promise<{ sessionId: string }> };

const MAX_NOTEBOOK_UPLOAD_BYTES = 10 * 1024 * 1024;
const NOTEBOOK_UPLOAD_MIME = 'application/octet-stream';

async function handleList(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'files-serve', `user:${userId}`);
  if (limited) return limited;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable('Managed Code is not enabled for this deployment');
  }
  const { sessionId } = await context.params;

  // Listing a session's files claims the session and provisions the sandbox, so
  // it buys managed compute exactly as the upload below does and answers to the
  // same gate.
  const entitlement = await resolveEntitlementBundle(db, userId);
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
    return NextResponse.json(
      await listCloudCodeNotebookFiles(db, { userId, organizationId }, sessionId, planTier),
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

async function handleUpload(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable('Managed Code is not enabled for this deployment');
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.capabilityUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  let formData: FormData;
  try {
    formData = (await request.formData()) as unknown as FormData;
  } catch {
    throw createError.validation('Invalid multipart form data');
  }
  const file = formData.get('file');
  const path = formData.get('path');
  if (!file || typeof file === 'string') {
    throw createError.validation('Missing file');
  }
  if (typeof path !== 'string' || !path.trim()) {
    throw createError.validation('Missing path');
  }
  if (file.size > MAX_NOTEBOOK_UPLOAD_BYTES) {
    throw createError.payloadTooLarge(
      `File exceeds maximum size of ${MAX_NOTEBOOK_UPLOAD_BYTES} bytes`,
    );
  }

  const { sessionId } = await context.params;
  const entitlement = await resolveEntitlementBundle(db, userId);
  const accessDecision = await evaluateManagedComputeAccess(
    db,
    userId,
    entitlement.subscription,
    resolveCloudChatSurface(request),
    { request },
  );
  const accessGateResponse = buildManagedComputeAccessGateResponse(accessDecision);
  if (accessGateResponse) return accessGateResponse;
  const planTier = entitlement.plan;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : path;
  await refuseUnsafeUpload(bytes, file.type || NOTEBOOK_UPLOAD_MIME, {
    leadsObject: true,
    filename: fileName,
  });
  const base64Content = Buffer.from(bytes).toString('base64');
  try {
    return NextResponse.json(
      await writeCloudCodeNotebookFile(
        db,
        { userId, organizationId },
        sessionId,
        path,
        base64Content,
        planTier,
      ),
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleUpload);
