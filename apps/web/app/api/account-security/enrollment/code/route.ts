import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { AccountSecurityEnrollmentCodeResponse } from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ACCOUNT_SECURITY_SCOPE,
  accountSecurityCaller,
  sendEnrollmentCode,
} from '@/lib/server/account-security/service';

async function handleSend(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-email');
  if (limited) return limited;

  const caller = await accountSecurityCaller(
    request,
    await getUserScopedDb(request, ACCOUNT_SECURITY_SCOPE),
  );
  const sent: AccountSecurityEnrollmentCodeResponse = await sendEnrollmentCode(caller);
  return NextResponse.json(sent, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleSend);
