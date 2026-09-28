import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ACCOUNT_SECURITY_RECOVERY_KEYS_PATH,
  AccountSecurityRecoveryKeysSavedSchema,
  type AccountSecurityRecoveryKeysResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  accountSecurityCaller,
  confirmReplacementRecoveryKeys,
  prepareRecoveryKeys,
} from '@/lib/server/account-security/service';

async function handlePrepare(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  const keys: AccountSecurityRecoveryKeysResponse = await prepareRecoveryKeys(caller);
  return NextResponse.json(keys, { headers: { 'Cache-Control': 'no-store' } });
}

async function handleConfirmReplacement(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  await readValidatedJsonBody(
    request,
    AccountSecurityRecoveryKeysSavedSchema,
    'Confirm that you saved your new recovery keys.',
  );
  await requireStepUp({
    userId: caller.userId,
    action: 'account_security.change',
    request,
    endpoint: ACCOUNT_SECURITY_RECOVERY_KEYS_PATH,
  });
  await confirmReplacementRecoveryKeys(caller, request);
  return new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handlePrepare);
export const PUT = withErrorHandler(handleConfirmReplacement);
