import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AccountSecurityUndoRequestSchema,
  type AccountSecurityUndoResponse,
} from '@agiworkforce/cloud-contracts/account-security';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { turnOffFromEmailLink } from '@/lib/server/account-security/undo';

async function handleUndo(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const limited = await withRateLimit(request, 'account-security-handoff');
  if (limited) return limited;

  const body = await readValidatedJsonBody(
    request,
    AccountSecurityUndoRequestSchema,
    'This link is not valid. Open it again from the email.',
  );
  const undone: AccountSecurityUndoResponse = await turnOffFromEmailLink(
    getNeonDb(),
    body.token,
    request,
  );
  return NextResponse.json(undone, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleUndo);
