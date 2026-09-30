import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSecurityRecoveryStartRequestSchema,
  type AccountSecurityRecoveryStartedResponse,
  type AccountSecurityVerificationResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  ACCOUNT_SECURITY_VERIFYING_SCOPE,
  accountSecurityCaller,
  cancelPendingRecovery,
  completeRecovery,
  startRecovery,
} from '@/lib/server/account-security/service';

async function handleStart(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-recovery');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_VERIFYING_SCOPE),
  );
  const body = await readValidatedJsonBody(
    request,
    AccountSecurityRecoveryStartRequestSchema,
    'Enter one of your recovery keys.',
  );
  const started: AccountSecurityRecoveryStartedResponse = {
    recovery: await startRecovery(caller, body.recoveryKey, request),
  };
  return NextResponse.json(started, { status: 201 });
}

async function handleComplete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-verify');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_VERIFYING_SCOPE),
  );
  const verified: AccountSecurityVerificationResponse = {
    verifiedUntil: await completeRecovery(caller, request),
  };
  return NextResponse.json(verified);
}

async function handleCancel(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  await cancelPendingRecovery(caller, request);
  return new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handleStart);
export const PUT = withErrorHandler(handleComplete);
export const DELETE = withErrorHandler(handleCancel);
