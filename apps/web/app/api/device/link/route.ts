import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { getEnv } from '@shared/utils/env';
import { DeviceLinkRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

async function handleDeviceLink(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let authUser: { userId: string; email?: string };
  try {
    authUser = await getClerkAuthUser(request);
  } catch {
    logger.warn({}, 'Unauthenticated device link attempt rejected');
    return NextResponse.json(
      { error: 'Authentication required to link a device' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createError.validation('Invalid JSON in request body');
    }

    const validationResult = DeviceLinkRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw createError.validation('Invalid request body', validationResult.error);
    }

    const { device_id, device_name, device_type, device_fingerprint } = validationResult.data;
    const resolvedDeviceType = device_type || 'desktop';

    const db = getNeonDb();

    const appUrlRaw = getEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
    let appUrl: string;
    try {
      const parsed = new URL(appUrlRaw);
      if (parsed.protocol !== 'https:') {
        throw new Error(`Expected https: protocol, got ${parsed.protocol}`);
      }
      appUrl = parsed.origin;
    } catch (err) {
      logger.warn({ appUrl: appUrlRaw, err }, 'NEXT_PUBLIC_APP_URL is invalid; using default');
      appUrl = 'https://agiworkforce.com';
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let link_code = '';
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      link_code = randomBytes(8).toString('hex').toUpperCase();
      try {
        await db.execute(
          `INSERT INTO device_authorization_codes
             (device_id, device_name, device_type, device_fingerprint, user_code, status,
              user_id, user_email, user_name, access_token, refresh_token,
              authorized_at, consumed_at, denied_at, revoked_at, expires_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'pending',
                   NULL, NULL, NULL, NULL, NULL,
                   NULL, NULL, NULL, NULL, $6, $7)
           ON CONFLICT (device_id) DO UPDATE SET
             device_name        = EXCLUDED.device_name,
             device_type        = EXCLUDED.device_type,
             device_fingerprint = EXCLUDED.device_fingerprint,
             user_code          = EXCLUDED.user_code,
             status             = 'pending',
             user_id            = NULL,
             user_email         = NULL,
             user_name          = NULL,
             access_token       = NULL,
             refresh_token      = NULL,
             authorized_at      = NULL,
             consumed_at        = NULL,
             denied_at          = NULL,
             revoked_at         = NULL,
             expires_at         = EXCLUDED.expires_at,
             updated_at         = EXCLUDED.updated_at`,
          [
            device_id,
            device_name || null,
            resolvedDeviceType,
            device_fingerprint || null,
            link_code,
            expiresAt.toISOString(),
            new Date().toISOString(),
          ],
        );
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const isUniqueViolation =
          err instanceof Error && (err.message.includes('23505') || err.message.includes('unique'));
        if (!isUniqueViolation) {
          break;
        }
      }
    }

    if (lastError) {
      logger.error({ error: lastError, device_id }, 'Failed to create device code');
      throw createError.internal('Failed to create device authorization code');
    }

    void authUser;

    const verify_url = `${appUrl}/verify?code=${encodeURIComponent(link_code)}`;

    const qr_code_url = await QRCode.toDataURL(verify_url, { width: 200, margin: 1 });

    return NextResponse.json(
      {
        link_code,
        device_id,
        verify_url,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        qr_code_url,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in device/link',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDeviceLink);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
