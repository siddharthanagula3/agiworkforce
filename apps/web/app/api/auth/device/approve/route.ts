import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';

const DeviceCodeApproveSchema = z.object({
  user_code: z
    .string()
    .min(1, 'user_code is required')
    .max(16, 'user_code is too long')
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value), 'Invalid user code format'),
  action: z.enum(['approve', 'deny']).optional(),
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

  // Non-reversible reference to the device. `device_id` is the polling secret
  // for the CLI/desktop flow and must never be persisted into an audit row.
  const deviceRef = crypto
    .createHash('sha256')
    .update(record.device_id + (process.env['LOG_SALT'] ?? ''))
    .digest('hex')
    .slice(0, 12);

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
