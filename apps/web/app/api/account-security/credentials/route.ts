import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ACCOUNT_SECURITY_CREDENTIALS_PATH,
  AccountSecurityRegistrationRequestSchema,
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
  finishCredentialRegistration,
} from '@/lib/server/account-security/service';

async function handleRegister(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  const body = await readValidatedJsonBody(
    request,
    AccountSecurityRegistrationRequestSchema,
    'Name the passkey or security key and try again.',
  );
  await requireStepUp({
    userId: caller.userId,
    action: 'account_security.change',
    request,
    endpoint: ACCOUNT_SECURITY_CREDENTIALS_PATH,
  });
  const credential = await finishCredentialRegistration(caller, body, request);
  return NextResponse.json({ credential }, { status: 201 });
}

export const POST = withErrorHandler(handleRegister);
