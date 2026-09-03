import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';
import { CONTACT_EMAIL } from '@/lib/legal-constants';

export const runtime = 'nodejs';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

const PG_UNDEFINED_COLUMN = '42703';

function isMissingDeletionColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN;
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'account-deletion-cancel');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = getNeonDb();
  const subjectRef = pseudonymizeIdentifier(userId, 'delete-account-subject', 16);

  try {
    let cancelled: Array<{ id: string }> = [];
    try {
      cancelled = await db.query<{ id: string }>(
        `update profiles
            set deletion_requested_at = null,
                deletion_scheduled_for = null
          where id = $1
            and deletion_scheduled_for is not null
            and deletion_scheduled_for > now()
          returning id`,
        [userId],
      );
    } catch (updateErr: unknown) {
      if (!isMissingDeletionColumns(updateErr)) throw updateErr;
      return NextResponse.json(
        { message: 'No account deletion is pending.', cancelled: false },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    if (cancelled.length > 0) {
      logger.info({ userId }, 'Account deletion cancelled inside the grace window');

      await recordAuditEvent({
        userId: null,
        eventType: 'account_deletion_cancelled',
        severity: 'info',
        request,
        detail: { resourceType: 'account', subjectRef, status: 'cancelled' },
      });

      return NextResponse.json(
        { message: 'Account deletion cancelled. Your account is fully restored.', cancelled: true },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    const rows = await db.query<{ deletion_scheduled_for: string | null }>(
      `select deletion_scheduled_for from profiles where id = $1`,
      [userId],
    );
    const scheduledFor = rows[0]?.deletion_scheduled_for ?? null;

    if (scheduledFor === null) {
      return NextResponse.json(
        { message: 'No account deletion is pending.', cancelled: false },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    logger.warn({ userId }, 'Account deletion cancellation refused: grace window has closed');
    return NextResponse.json(
      {
        error: `The cancellation window has closed and erasure is already underway. Nothing was restored. Contact ${CONTACT_EMAIL} if you believe this is wrong.`,
        cancelled: false,
        reason: 'grace_window_expired',
      },
      { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error while cancelling account deletion');
    return NextResponse.json(
      { error: `An unexpected error occurred. Please contact ${CONTACT_EMAIL}.` },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
