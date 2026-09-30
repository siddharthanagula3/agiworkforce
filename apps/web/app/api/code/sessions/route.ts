import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  getPlanMaxSandboxes,
  type CloudCodeSession,
  type CloudCodeSessionStatusFilter,
} from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { listCloudCodeRuntimes } from '@/lib/e2b/templates';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  asCloudCodeSessionStatusFilter,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
  listCloudCodeSessions,
} from '@/lib/services/cloud-code-session-service';
import { openCloudCodeSession } from '@/lib/services/cloud-code-session-open';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';

export const runtime = 'nodejs';

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

async function handleList(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation-read', `user:${userId}`);
  if (limited) return limited;

  const planTier = await resolveEntitledPlanTier(db, userId);
  const maxSessions = getPlanMaxSandboxes(planTier);
  let status: CloudCodeSessionStatusFilter;
  try {
    status = asCloudCodeSessionStatusFilter(request.nextUrl.searchParams.get('status'));
  } catch (error) {
    if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
    throw error;
  }
  let storageReady = true;
  let sessions: CloudCodeSession[];
  try {
    sessions = await listCloudCodeSessions(db, { userId, organizationId }, status);
  } catch (error) {
    if (!isCloudCodeSchemaUnavailable(error)) throw error;
    storageReady = false;
    sessions = [];
  }
  // Offered only to an entitled account: the catalogue is a read against the
  // team's E2B org, not public information, and an unentitled caller cannot
  // create a session with any of it.
  const runtimes = maxSessions > 0 ? await listCloudCodeRuntimes() : [];
  return NextResponse.json({
    availability: {
      deploymentEnabled: e2bProvisioningReady(),
      storageReady,
      planEntitled: maxSessions > 0,
      planTier,
      maxSessions,
    },
    sessions,
    runtimes,
  });
}

async function handleCreate(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const body = await requestObject(request);
  const opened = await openCloudCodeSession(request, db, { userId, organizationId }, body);
  if (opened instanceof Response) return opened;
  if (!opened.reused) {
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: { resourceType: 'code_session', resourceId: opened.session.id, status: 'opened' },
    });
  }
  return NextResponse.json({ session: opened.session, terminalEntries: [] }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
