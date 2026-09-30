import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ACCOUNT_SECURITY_PATH,
  type AccountSecurityStatus,
} from '@agiworkforce/cloud-contracts/account-security';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_VERIFYING_SCOPE,
  accountSecurityCaller,
  readAccountSecurityStatus,
} from '@/lib/server/account-security/service';

async function handleStatus(request: NextRequest) {
  const limited = await withRateLimit(request, 'account-security-read');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_VERIFYING_SCOPE),
  );
  const status: AccountSecurityStatus = await readAccountSecurityStatus(caller);
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store', 'Content-Location': ACCOUNT_SECURITY_PATH },
  });
}

export const GET = withErrorHandler(handleStatus);
