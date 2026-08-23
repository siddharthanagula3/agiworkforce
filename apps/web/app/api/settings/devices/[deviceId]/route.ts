import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from '../../sessions/session-principal';
import { getNeonDb } from '@/lib/server/neon-db';
import { isCredentialLinkMissing } from '../schema-state';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleUnlink(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { deviceId } = await context.params;
  if (!UUID.test(deviceId)) {
    throw createError.validation('Invalid device ID');
  }

  const db = getNeonDb();
  const result = await db.transaction(async (tx) => {
    const owned = await tx.query<{ kind: string; name: string | null }>(
      `select 'desktop' as kind, name from desktop_devices where id = $1 and user_id = $2
       union all
       select 'mobile' as kind, name from mobile_devices where id = $1 and user_id = $2
       limit 1`,
      [deviceId, userId],
    );
    const device = owned[0];
    if (!device) return null;

    // Revoke by family, not by row: rotation issues a fresh row per refresh, so
    // targeting device_id alone would leave the newest credential of a family
    // whose earlier rows were written before 0133 recorded the device.
    // Until 0133 lands there is no device_id to scope by. Revoking every family
    // on the account would sign out the user's other devices to unlink one, so
    // this unregisters and says plainly that no credential was revoked.
    let revoked: Array<{ id: string }> = [];
    let credentialsRevocable = true;
    try {
      revoked = await tx.query<{ id: string }>(
        `update device_refresh_tokens
            set revoked_at = coalesce(revoked_at, now())
          where user_id = $2
            and revoked_at is null
            and family_id in (
              select family_id from device_refresh_tokens
               where user_id = $2 and device_id = $1
            )
          returning id`,
        [deviceId, userId],
      );
    } catch (error) {
      if (!isCredentialLinkMissing(error)) throw error;
      credentialsRevocable = false;
    }

    await tx.execute(`delete from desktop_devices where id = $1 and user_id = $2`, [
      deviceId,
      userId,
    ]);
    await tx.execute(`delete from mobile_devices where id = $1 and user_id = $2`, [
      deviceId,
      userId,
    ]);

    return { kind: device.kind, revokedCredentials: revoked.length, credentialsRevocable };
  });

  if (!result) {
    throw createError.notFound('Device not found');
  }

  logger.info(
    { userId, kind: result.kind, revokedCredentials: result.revokedCredentials },
    'Linked device unlinked',
  );

  await recordAuditEvent({
    userId,
    eventType: 'session_revoked',
    request,
    detail: {
      resourceType: `device:${result.kind}`,
      source: 'unlink_device',
      count: result.revokedCredentials,
    },
  });

  return NextResponse.json({
    message: 'Device unlinked',
    revokedCredentials: result.revokedCredentials,
    credentialsRevoked: result.credentialsRevocable,
  });
}

export const DELETE = withErrorHandler(handleUnlink);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
