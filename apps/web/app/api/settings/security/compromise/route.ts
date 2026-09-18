import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getIdentityProvider } from '@/lib/server/identity';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  readOpenCompromiseResponse,
  respondToAccountCompromise,
} from '@/lib/services/identity-events';

const SCOPE = { resolveOrganization: true } as const;

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

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleReport);
