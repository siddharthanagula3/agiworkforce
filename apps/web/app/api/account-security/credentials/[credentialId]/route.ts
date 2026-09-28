import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ACCOUNT_SECURITY_CREDENTIALS_PATH } from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  accountSecurityCaller,
  callerIsEnrolled,
  removeCredential,
} from '@/lib/server/account-security/service';

async function handleRemove(
  request: NextRequest,
  context: { params: Promise<{ credentialId: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const { credentialId } = await context.params;
  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  if (await callerIsEnrolled(caller)) {
    await requireStepUp({
      userId: caller.userId,
      action: 'account_security.change',
      resourceId: credentialId,
      request,
      endpoint: ACCOUNT_SECURITY_CREDENTIALS_PATH,
    });
  }
  await removeCredential(caller, credentialId, request);
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withErrorHandler(handleRemove);
