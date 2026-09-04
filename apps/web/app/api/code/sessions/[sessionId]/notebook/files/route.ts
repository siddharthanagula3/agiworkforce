import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { effectivePlanTier } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
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
  listCloudCodeNotebookFiles,
  writeCloudCodeNotebookFile,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

export const runtime = 'nodejs';
export const maxDuration = 600;

type RouteContext = { params: Promise<{ sessionId: string }> };

const MAX_NOTEBOOK_UPLOAD_BYTES = 10 * 1024 * 1024;

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

async function planTierFor(db: DatabaseAdapter, userId: string): Promise<string> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  return effectivePlanTier(subscription?.plan_tier, subscription?.status);
}

async function handleList(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'files-serve', `user:${userId}`);
  if (limited) return limited;
  if (!e2bProvisioningReady()) {
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
  }
  const { sessionId } = await context.params;
  const planTier = await planTierFor(db, userId);
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
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
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
  const planTier = await planTierFor(db, userId);
  const base64Content = Buffer.from(await file.arrayBuffer()).toString('base64');
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
