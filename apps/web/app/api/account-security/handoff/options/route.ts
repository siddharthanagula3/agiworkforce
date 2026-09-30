import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { AccountSecurityHandoffOptionsRequestSchema } from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { beginHandoffVerification } from '@/lib/server/account-security/handoff';

async function handleOptions(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-handoff');
  if (limited) return limited;

  const body = await readValidatedJsonBody(
    request,
    AccountSecurityHandoffOptionsRequestSchema,
    'This link is not valid. Start again from the app.',
  );
  const options = await beginHandoffVerification(getNeonDb(), body.handoff);
  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleOptions);
