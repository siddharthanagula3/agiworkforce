import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { clerkClient } from '@clerk/nextjs/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseUserAccountData } from '@/lib/server/account-erasure';
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

export async function DELETE(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = getNeonDb();

  const subjectRef = pseudonymizeIdentifier(userId, 'delete-account-subject', 16);

  try {
    try {
      const scheduledRows = await db.execute(
        `update profiles
         set deletion_requested_at = $1,
             deletion_scheduled_for = $2
         where id = $3`,
        [
          new Date().toISOString(),
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          userId,
        ],
      );

      if (scheduledRows === 0) {
        logger.error({ userId }, 'Account deletion matched no profiles row; nothing was scheduled');
        return NextResponse.json(
          {
            error: `Account deletion could not be scheduled because your profile record was not found. Nothing was deleted. Please contact ${CONTACT_EMAIL}.`,
          },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }
    } catch (updateErr: unknown) {
      const updateErrMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);

      if (!isMissingDeletionColumns(updateErr)) {
        logger.error({ userId, error: updateErrMsg }, 'Account deletion scheduling failed');
        return NextResponse.json(
          {
            error: `Account deletion could not be scheduled. Nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
          },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }

      logger.warn(
        { userId, error: updateErrMsg },
        'Deletion columns are not provisioned; attempting immediate delete',
      );

      try {
        const erasure = await eraseUserAccountData(userId);
        if (!erasure.complete) {
          logger.error({ userId, erasure }, 'Immediate account erasure was incomplete');
          return NextResponse.json(
            {
              error: `Account deletion did not finish. Some of your data has already been removed and the rest is still stored; your sign-in still works. Please contact ${CONTACT_EMAIL} so the erasure can be completed.`,
            },
            { status: 500, headers: SECURITY_HEADERS },
          );
        }
        const client = await clerkClient();
        await client.users.deleteUser(userId);
      } catch (clerkErr: unknown) {
        const errMsg = clerkErr instanceof Error ? clerkErr.message : String(clerkErr);
        logger.error({ userId, error: errMsg }, 'Account deletion failed');
        return NextResponse.json(
          { error: `Account deletion failed. Please contact ${CONTACT_EMAIL}.` },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }

      logger.info({ userId }, 'Account deleted immediately (soft delete unavailable)');

      await recordAuditEvent({
        userId: null,
        eventType: 'account_deletion_requested',
        severity: 'warning',
        request,
        detail: { resourceType: 'account', subjectRef, status: 'erased_immediately' },
      });

      return NextResponse.json(
        { message: 'Account deleted successfully.' },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    logger.info({ userId }, 'Account deletion scheduled');

    await recordAuditEvent({
      userId: null,
      eventType: 'account_deletion_requested',
      severity: 'warning',
      request,
      detail: { resourceType: 'account', subjectRef, status: 'scheduled' },
    });

    return NextResponse.json(
      {
        message: `Account deletion scheduled. Your account and all data will be permanently deleted within 24 hours. To stop this, email ${CONTACT_EMAIL} before then.`,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error during account deletion');
    return NextResponse.json(
      { error: `An unexpected error occurred. Please contact ${CONTACT_EMAIL}.` },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
