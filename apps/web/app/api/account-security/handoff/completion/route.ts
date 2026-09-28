import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSecurityHandoffCompletionRequestSchema,
  type AccountSecurityVerificationResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_VERIFYING_SCOPE,
  accountSecurityCaller,
  completeHandoff,
} from '@/lib/server/account-security/service';

async function handleComplete(request: NextRequest) {
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
    AccountSecurityHandoffCompletionRequestSchema,
    'This sign-in could not be confirmed. Start again from the app.',
  );
  const verified: AccountSecurityVerificationResponse = {
    verifiedUntil: await completeHandoff(caller, body, request),
  };
  return NextResponse.json(verified);
}

export const POST = withErrorHandler(handleComplete);
