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
import crypto from 'node:crypto';

/**
 * DELETE /api/user/delete-account
 *
 * Permanently deletes a user's account and all associated data.
 * Requires authenticated session (Bearer token or cookie).
 *
 * The profiles soft-delete is written via Neon parameterized SQL.
 * The auth user removal uses clerkClient().users.deleteUser.
 *
 * This endpoint schedules deletion rather than doing it immediately,
 * giving the user a 24-hour grace window before permanent erasure.
 *
 * PER-24: the erasure the response promises is performed by
 * `GET /api/cron/purge-deleted-accounts`, which runs
 * `lib/server/account-erasure.ts` once `deletion_scheduled_for` has passed.
 * Before that job existed this route's "will be permanently deleted within 24
 * hours" was simply untrue: nothing ever consumed `deletion_scheduled_for`, so
 * conversations, artifacts, memories, settings and every stored R2 object
 * survived indefinitely.
 *
 * HONESTY CONTRACT — do not re-add either claim without the implementation:
 *
 * 1. No confirmation email is sent. There is no transactional email provider
 *    anywhere in this repository (no resend/sendgrid/postmark/mailgun/SES/smtp
 *    dependency or client). This response previously asserted "A confirmation
 *    email has been sent", which was a false statement inside a GDPR Art. 17
 *    flow. When an email provider is wired, send the mail here first, then
 *    restore the sentence.
 * 2. There is no self-serve cancel route. `deletion_requested_at` /
 *    `deletion_scheduled_for` are written here and consumed only by the purge
 *    cron; nothing clears them. The grace window is real (the cron will not act
 *    before `deletion_scheduled_for`), so support can still reverse it, but the
 *    user cannot. Point them at support until a cancel endpoint exists.
 */

export const runtime = 'nodejs';

/** Security headers applied to all responses from this endpoint. */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

export async function DELETE(request: NextRequest) {
  // Strict rate limit - this is a destructive action (5 req/min per IP)
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) return rateLimitResponse;

  // SECURITY: CSRF protection - account deletion is an irreversible state-changing action
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

  /**
   * AUDIT-TRAIL-01 — why this event is recorded UNATTRIBUTED.
   *
   * `public.delete_user_data(text)` (0020_functions.sql) deletes every
   * `security_audit_logs` row whose `user_id` matches the erased account. An
   * `account_deletion_requested` row keyed to that user would therefore be
   * destroyed by the very flow it records, leaving no evidence the erasure was
   * ever requested. It is written with `user_id = null` plus a salted,
   * non-reversible subject reference so the event survives erasure while
   * carrying no personal identifier — which is also what GDPR Art. 17 wants.
   *
   * Consequence, stated honestly: this row does NOT appear in the user's own
   * "Security activity" panel (that view filters on user_id).
   */
  const subjectRef = crypto
    .createHash('sha256')
    .update(userId + (process.env['LOG_SALT'] ?? ''))
    .digest('hex')
    .slice(0, 16);

  try {
    // Schedule deletion: set deletion_requested_at. A background job
    // (`/api/cron/purge-deleted-accounts`) performs the actual erasure once
    // deletion_scheduled_for has passed. Nothing clears these columns, so the
    // grace window is support-reversible only — see the HONESTY CONTRACT above
    // before advertising a self-serve cancel.
    try {
      await db.execute(
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
    } catch (updateErr: unknown) {
      // Profiles table may not have deletion columns yet; fall back to immediate delete
      logger.warn(
        { userId, error: updateErr instanceof Error ? updateErr.message : String(updateErr) },
        'Soft deletion failed; attempting immediate delete',
      );

      try {
        // PER-24: the immediate path must erase the DATA too, not just the
        // auth account. Previously it deleted the Clerk user and left every
        // row and every stored object behind, with no owner left to request
        // their removal.
        const erasure = await eraseUserAccountData(userId);
        if (!erasure.complete) {
          logger.error({ userId, erasure }, 'Immediate account erasure was incomplete');
          return NextResponse.json(
            {
              error:
                'Account deletion could not be completed. No data was partially removed from your account. Please contact support@agiworkforce.com.',
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
          { error: 'Account deletion failed. Please contact support@agiworkforce.com.' },
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
        message:
          'Account deletion scheduled. Your account and all data will be permanently deleted within 24 hours. To stop this, email support@agiworkforce.com before then.',
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error during account deletion');
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please contact support@agiworkforce.com.' },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
