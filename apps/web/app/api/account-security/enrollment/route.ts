import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ACCOUNT_SECURITY_ENROLLMENT_PATH,
  AccountSecurityAssertionRequestSchema,
  AccountSecurityEnrollmentRequestSchema,
  type AccountSecurityEnrollmentResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  accountSecurityCaller,
  disableAccountSecurity,
  enrollAccountSecurity,
} from '@/lib/server/account-security/service';

async function handleEnroll(request: NextRequest) {
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
    AccountSecurityEnrollmentRequestSchema,
    'Confirm that you saved your recovery keys, enter the code we emailed you and confirm with one of your passkeys or security keys.',
  );
  await requireStepUp({
    userId: caller.userId,
    action: 'account_security.enroll',
    request,
    endpoint: ACCOUNT_SECURITY_ENROLLMENT_PATH,
  });
  const enrolled: AccountSecurityEnrollmentResponse = await enrollAccountSecurity(
    caller,
    getNeonDb(),
    { emailCode: body.emailCode, response: body.response },
    request,
  );
  return NextResponse.json(enrolled, { status: 201 });
}

async function handleDisable(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-verify');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  const body = await readValidatedJsonBody(
    request,
    AccountSecurityAssertionRequestSchema,
    'Confirm with one of your passkeys or security keys.',
  );
  await disableAccountSecurity(caller, body.response, request);
  return new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handleEnroll);
export const DELETE = withErrorHandler(handleDisable);
