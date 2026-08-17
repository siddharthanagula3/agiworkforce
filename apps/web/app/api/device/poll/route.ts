import { NextRequest, NextResponse } from 'next/server';
import { devicePairingFlow, DevicePollRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { decryptToken } from '@/lib/device-token-crypto';
import { getNeonDb } from '@/lib/server/neon-db';

interface DeviceAuthRow {
  device_id: string;
  device_fingerprint: string | null;
  user_code: string | null;
  status: string;
  user_id: string | null;
  expires_at: string;
  updated_at: string;
}

interface ConsumedRow {
  status: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
}

async function handleDevicePoll(request: NextRequest) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const rawDeviceId = (parsedBody as Record<string, unknown>)?.['device_id'];
  const deviceId =
    typeof rawDeviceId === 'string' && /^[a-zA-Z0-9-_]{1,128}$/.test(rawDeviceId)
      ? rawDeviceId
      : undefined;

  const rateLimitResponse = await withRateLimit(
    request,
    'device-poll',
    deviceId ? `device:${deviceId}` : undefined,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const validationResult = DevicePollRequestSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      throw createError.validation('Invalid request body', validationResult.error);
    }

    const { device_id, device_fingerprint } = validationResult.data;
    const db = getNeonDb();

    const rows = await db.query<DeviceAuthRow>(
      `SELECT device_id, device_fingerprint, user_code, status, user_id, expires_at, updated_at
         FROM device_authorization_codes
        WHERE device_id = $1`,
      [device_id],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const data = rows[0]!;

    // device_authorization_codes is shared with the RFC 8628 CLI flow; polling a row that
    // belongs to that flow would consume it here and strand the CLI sign-in.
    if (devicePairingFlow(data.user_code) !== 'qr') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (data.status === 'consumed' || new Date(data.expires_at) < new Date()) {
      if (data.status === 'pending') {
        await db.execute(
          `UPDATE device_authorization_codes
              SET status = 'expired', updated_at = $1
            WHERE device_id = $2`,
          [new Date().toISOString(), device_id],
        );
      }
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (data.device_fingerprint) {
      if (!device_fingerprint || data.device_fingerprint !== device_fingerprint) {
        logger.warn(
          {
            deviceId: device_id,
            expectedFingerprint: data.device_fingerprint,
            providedFingerprint: device_fingerprint,
          },
          'Device fingerprint mismatch - potential unauthorized access attempt',
        );
        throw createError.forbidden('Device fingerprint does not match');
      }
    } else if (device_fingerprint) {
      await db.execute(
        `UPDATE device_authorization_codes
            SET device_fingerprint = $1, updated_at = $2
          WHERE device_id = $3
            AND device_fingerprint IS NULL`,
        [device_fingerprint, new Date().toISOString(), device_id],
      );
      logger.info({ deviceId: device_id }, 'Device fingerprint backfilled for legacy session');
    } else {
      logger.warn(
        { deviceId: device_id },
        'DEPRECATED: Device poll without fingerprint rejected - legacy path is sunset. Client must update.',
      );
      return NextResponse.json(
        {
          status: 'error',
          error: 'This authentication method is deprecated. Please update your app.',
        },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (data.status === 'approved' && data.user_id) {
      const consumedRows = await db.query<ConsumedRow>(
        `WITH locked AS (
           SELECT status, expires_at, user_id, user_email, user_name,
                  access_token, refresh_token
             FROM device_authorization_codes
            WHERE device_id = $1
            FOR UPDATE
         ),
         updated AS (
           UPDATE device_authorization_codes d
              SET status      = 'consumed',
                  consumed_at = NOW(),
                  access_token  = NULL,
                  refresh_token = NULL,
                  updated_at    = NOW()
             FROM locked
            WHERE d.device_id = $1
              AND locked.status = 'approved'
         )
         SELECT
           locked.status::text        AS status,
           locked.user_id             AS user_id,
           locked.user_email          AS user_email,
           locked.user_name           AS user_name,
           locked.access_token::text  AS access_token,
           locked.refresh_token::text AS refresh_token
           FROM locked`,
        [device_id],
      );

      if (!consumedRows.length) {
        return NextResponse.json(
          { status: 'pending' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      const consumed = consumedRows[0]!;

      if (consumed.status === 'expired' || consumed.status === 'consumed') {
        return NextResponse.json(
          { status: 'expired' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (consumed.status === 'denied' || consumed.status === 'revoked') {
        return NextResponse.json(
          { status: 'denied' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (consumed.status !== 'approved') {
        return NextResponse.json(
          { status: 'pending' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (!consumed.access_token || !consumed.user_id) {
        logger.warn(
          { deviceId: device_id, status: consumed.status },
          'Device code approved but tokens missing after consumption',
        );
        return NextResponse.json({ status: 'pending' });
      }

      let accessToken: string;
      let refreshToken: string | null = null;
      try {
        accessToken = decryptToken(consumed.access_token);
        if (consumed.refresh_token) {
          refreshToken = decryptToken(consumed.refresh_token);
        }
      } catch (decryptError) {
        logger.error(
          {
            error: decryptError instanceof Error ? decryptError.message : String(decryptError),
            deviceId: device_id,
          },
          'Failed to decrypt device tokens - they may have been stored before encryption was enabled',
        );
        throw createError.internal('Failed to decrypt device authorization tokens');
      }

      return NextResponse.json(
        {
          status: 'approved',
          access_token: accessToken,
          refresh_token: refreshToken,
          user: {
            id: consumed.user_id,
            email: consumed.user_email,
            name: consumed.user_name,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } else if (data.status === 'denied') {
      return NextResponse.json({ status: 'denied' }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (data.status === 'revoked') {
      return NextResponse.json({ status: 'denied' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        deviceId,
      },
      'Error in device/poll',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDevicePoll);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
