import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSecurityHandoffRequestSchema,
  type AccountSecurityHandoffResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_VERIFYING_SCOPE,
  accountSecurityCaller,
  openHandoff,
} from '@/lib/server/account-security/service';

async function handleOpen(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-verify');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_VERIFYING_SCOPE),
  );
  const body = await readValidatedJsonBody(
    request,
    AccountSecurityHandoffRequestSchema,
    'This app could not start browser verification. Update it and try again.',
  );
  const handoff: AccountSecurityHandoffResponse = await openHandoff(caller, body);
  return NextResponse.json(handoff, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleOpen);
