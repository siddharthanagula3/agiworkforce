import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSecurityHandoffVerificationRequestSchema,
  type AccountSecurityHandoffVerifiedResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { finishHandoffVerification } from '@/lib/server/account-security/handoff';

async function handleVerify(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-handoff');
  if (limited) return limited;

  const body = await readValidatedJsonBody(
    request,
    AccountSecurityHandoffVerificationRequestSchema,
    'Use one of your passkeys or security keys.',
  );
  const verified: AccountSecurityHandoffVerifiedResponse = {
    returnUrl: await finishHandoffVerification(getNeonDb(), body.handoff, body.response, request),
  };
  return NextResponse.json(verified, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleVerify);
