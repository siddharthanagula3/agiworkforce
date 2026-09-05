import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { isDeviceCodeSignInEnabled } from '@/lib/server/device-signin-policy';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';
import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { CliUserCodeSchema } from '@/lib/validations/device';

const DeviceCodeApproveSchema = z.object({
  user_code: CliUserCodeSchema,
  action: z.enum(['approve', 'deny']).optional(),
  surface: z.literal('desktop').optional(),
});

interface DeviceAuthorizationRow {
  device_id: string;
  status: string;
  expires_at: string;
}

async function handleDeviceCodeApprove(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const authUser = await getClerkAuthUser(request);
  if (authUser.surfaceClass === 'developer') {
    throw createError.forbidden('Approving a device requires an interactive sign-in.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = DeviceCodeApproveSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }

  const db = getNeonDb();
  const userCode = parsed.data.user_code;
  const action = parsed.data.action ?? 'approve';

  const records = await db.query<DeviceAuthorizationRow>(
    `SELECT device_id, status, expires_at
       FROM device_authorization_codes
      WHERE user_code = $1`,
    [userCode],
  );

  if (!records.length) {
    throw createError.notFound('Code not found or expired. Check your CLI and try again.');
  }

  const record = records[0]!;

  if (record.status !== 'pending') {
    throw createError.conflict('This device code has already been processed');
  }

  const nowIso = new Date().toISOString();
  if (new Date(record.expires_at) < new Date()) {
    await db.execute(
      `UPDATE device_authorization_codes
          SET status = 'expired', updated_at = $1
        WHERE device_id = $2`,
      [nowIso, record.device_id],
    );
    throw createError.notFound('Code has expired. Please run the login command again.');
  }

  const deviceRef = pseudonymizeIdentifier(record.device_id, 'device-id', 12);

  if (action === 'deny') {
    const denied = await db.query<{ status: string }>(
      `UPDATE device_authorization_codes
          SET status = 'denied',
              user_id = $1,
              user_email = $2,
              denied_at = $3,
              updated_at = $3
        WHERE device_id = $4
          AND status = 'pending'
        RETURNING status`,
      [authUser.userId, authUser.email ?? null, nowIso, record.device_id],
    );

    if (!denied.length) {
      throw createError.conflict('This device code has already been processed');
    }

    await recordAuditEvent({
      userId: authUser.userId,
      eventType: 'device_authorization_denied',
      outcome: 'denied',
      request,
      detail: { resourceType: 'device_authorization', subjectRef: deviceRef },
    });

    return NextResponse.json(
      { success: true, approved: false, status: 'denied' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Enforced on APPROVAL, not on code issuance: starting the flow is
  // unauthenticated, so there is no account to consult until a human approves.
  // No approval means no token, which is the whole grant.
  const approverDb = createClaimedUserScopedDb(getNeonDb(), {
    userId: authUser.userId,
    organizationId: null,
  });
  if (!(await isDeviceCodeSignInEnabled(approverDb, authUser.userId))) {
    logger.info({ userId: authUser.userId }, 'Device approval refused: device sign-in is off');
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

  if (!(await hasAcceptedCurrentTerms(authUser.userId))) {
    const returnParams = new URLSearchParams({ user_code: userCode });
    if (parsed.data.surface === 'desktop') returnParams.set('surface', 'desktop');
    const returnTo = `/auth/device?${returnParams.toString()}`;
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

  const approved = await db.query<{ status: string }>(
    `UPDATE device_authorization_codes
        SET status = 'approved',
            user_id = $1,
            user_email = $2,
            user_name = $3,
            authorized_at = $4,
            updated_at = $4
      WHERE device_id = $5
        AND status = 'pending'
      RETURNING status`,
    [authUser.userId, authUser.email ?? null, null, nowIso, record.device_id],
  );

  if (!approved.length) {
    throw createError.conflict('This device code has already been processed');
  }

  logger.info({ deviceRef, userId: authUser.userId }, 'Device code approved');

  await recordAuditEvent({
    userId: authUser.userId,
    eventType: 'device_authorization_approved',
    request,
    detail: { resourceType: 'device_authorization', subjectRef: deviceRef },
  });

  return NextResponse.json(
    { success: true, approved: true, status: 'approved' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withErrorHandler(handleDeviceCodeApprove);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
