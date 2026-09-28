import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ACCOUNT_SECURITY_CREDENTIAL_OPTIONS_PATH } from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  accountSecurityCaller,
  beginCredentialRegistration,
} from '@/lib/server/account-security/service';

async function handleOptions(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-write');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  const options = await beginCredentialRegistration(caller);
  return NextResponse.json(options, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Location': ACCOUNT_SECURITY_CREDENTIAL_OPTIONS_PATH,
    },
  });
}

export const POST = withErrorHandler(handleOptions);
