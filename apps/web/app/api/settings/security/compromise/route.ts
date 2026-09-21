import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getIdentityProvider, getRequestIdentity } from '@/lib/server/identity';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { hasEnrolledSecondFactor } from '@/lib/server/step-up/verify-factor';
import {
  readOpenCompromiseResponse,
  resolveCompromiseResponse,
  respondToAccountCompromise,
} from '@/lib/services/identity-events';

const SCOPE = { resolveOrganization: true } as const;
const COMPROMISE_ENDPOINT = '/api/settings/security/compromise';

const RESOLUTION_STATUS_CODES = {
  resolved: 200,
  already_resolved: 200,
  outstanding: 409,
  not_found: 404,
} as const;

async function handleRead(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-account-compromise-read');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, SCOPE);
  const open = await readOpenCompromiseResponse(db, userId);

  return NextResponse.json({ response: open });
}

async function handleReport(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-account-compromise-report');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, SCOPE);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const response = await respondToAccountCompromise(db, getIdentityProvider(), {
    userId,
    trigger: 'reported',
    request,
    organizationId,
  });

  return NextResponse.json(response, { status: 202 });
}

async function readResponseId(request: NextRequest): Promise<string> {
  const body = (await request.json().catch(() => null)) as { responseId?: unknown } | null;
  const responseId = typeof body?.responseId === 'string' ? body.responseId.trim() : '';
  if (!responseId) throw createError.badRequest('Name the response to close.');
  return responseId;
}

/**
 * The way out of a lockdown. Nothing else in the product can clear
 * password_reset_required, so a false positive would otherwise hold the account
 * for ever.
 */
async function handleResolve(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-account-compromise-resolve');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, SCOPE);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const responseId = await readResponseId(request);

  // An account with no second factor cannot mint a grant, and demanding one
  // would make the hold permanent for exactly those accounts.
  const enrolled = await hasEnrolledSecondFactor(db, userId);
  if (enrolled) {
    await requireStepUp({
      userId,
      action: 'security.compromise_resolve',
      resourceId: responseId,
      organizationId,
      request,
      endpoint: COMPROMISE_ENDPOINT,
    });
  }

  const { sessionId } = await getRequestIdentity();
  const resolution = await resolveCompromiseResponse(db, getIdentityProvider(), {
    userId,
    responseId,
    currentSessionId: sessionId,
    secondFactorVerified: enrolled,
    request,
    organizationId,
  });

  return NextResponse.json(resolution, { status: RESOLUTION_STATUS_CODES[resolution.status] });
}

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleReport);
export const PATCH = withErrorHandler(handleResolve);
