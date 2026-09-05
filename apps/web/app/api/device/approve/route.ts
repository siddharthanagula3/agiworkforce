import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { isDeviceCodeSignInEnabled } from '@/lib/server/device-signin-policy';
import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { QrLinkCodeSchema } from '@/lib/validations/device';
import { getRequestIdentity } from '@/lib/server/identity';

const DeviceApproveRequestSchema = z.object({
  code: QrLinkCodeSchema,
  action: z.enum(['approve', 'deny']).optional(),
});

interface DeviceAuthRecord {
  device_id: string;
  status: string;
  expires_at: string;
}

async function handleDeviceApprove(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { subject: userId } = await getRequestIdentity();

    if (!userId) {
      throw createError.unauthorized('Please sign in to continue');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createError.validation('Invalid JSON in request body');
    }

    const parsed = DeviceApproveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw createError.validation('Invalid request body', parsed.error);
    }

    const code = parsed.data.code;
    const action = parsed.data.action ?? 'approve';

    const db = getNeonDb();

    const records = await db.query<DeviceAuthRecord>(
      `SELECT device_id, status, expires_at
         FROM device_authorization_codes
        WHERE user_code = $1`,
      [code],
    );

    if (!records.length) {
      throw createError.validation('Invalid or expired device code');
    }

    const record = records[0]!;

    if (new Date(record.expires_at) < new Date()) {
      await db.execute(
        `UPDATE device_authorization_codes
            SET status = 'expired', updated_at = $1
          WHERE device_id = $2`,
        [new Date().toISOString(), record.device_id],
      );
      throw createError.validation('This device code has expired');
    }

    if (record.status !== 'pending') {
      throw createError.conflict('This device code has already been processed');
    }

    const nowIso = new Date().toISOString();

    if (action === 'deny') {
      const updated = await db.query<{ status: string }>(
        `UPDATE device_authorization_codes
            SET status       = 'denied',
                user_id      = $1,
                denied_at    = $2,
                updated_at   = $2,
                access_token  = NULL,
                refresh_token = NULL,
                user_email   = $3,
                user_name    = $4
          WHERE device_id = $5
            AND status    = 'pending'
          RETURNING status`,
        [userId, nowIso, null, null, record.device_id],
      );

      if (!updated.length) {
        throw createError.conflict('This device code has already been processed');
      }

      return NextResponse.json(
        { success: true, status: 'denied' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Enforced on APPROVAL, not on code issuance: starting the flow is
    // unauthenticated, so there is no account to consult until a human approves.
    // Both gates sit after the deny branch so a rejection still works when the
    // account has device sign-in switched off.
    const approverDb = createClaimedUserScopedDb(getNeonDb(), {
      userId,
      organizationId: null,
    });
    if (!(await isDeviceCodeSignInEnabled(approverDb, userId))) {
      logger.info({ userId }, 'Device approval refused: device sign-in is off');
      return NextResponse.json(
        {
          error: {
            code: 'DEVICE_SIGNIN_DISABLED',
            message:
              'Device sign-in is turned off for this account. Turn it back on in Settings › Security to approve a device.',
          },
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!(await hasAcceptedCurrentTerms(userId))) {
      const returnTo = `/verify?${new URLSearchParams({ code }).toString()}`;
      return NextResponse.json(
        {
          error: {
            code: 'TERMS_ACCEPTANCE_REQUIRED',
            message: 'Review and accept the current Terms of Service before approving a device.',
          },
          acceptanceUrl: `/login/complete?redirectTo=${encodeURIComponent(returnTo)}`,
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Approval IS the grant, exactly as in /api/auth/device/approve. Stashing a
    // Clerk session token here handed the device a credential that expires in
    // about a minute and carries no refresh; the poll below mints the same
    // durable device credential /api/auth/device/token issues instead.
    const updated = await db.query<{ status: string }>(
      `UPDATE device_authorization_codes
          SET status        = 'approved',
              user_id       = $1,
              user_email    = $2,
              user_name     = $3,
              access_token  = NULL,
              refresh_token = NULL,
              authorized_at = $4,
              updated_at    = $4
        WHERE device_id = $5
          AND status    = 'pending'
        RETURNING status`,
      [userId, null, null, nowIso, record.device_id],
    );

    if (!updated.length) {
      throw createError.conflict('This device code has already been processed');
    }

    return NextResponse.json(
      { success: true, status: 'approved' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in /api/device/approve',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDeviceApprove);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
