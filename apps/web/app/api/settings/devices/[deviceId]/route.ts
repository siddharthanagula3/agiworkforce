import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { DeviceRenameRequestSchema } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { notifyDeviceDisconnected } from '@/lib/services/account-activity-notifications';
import { resolveSessionsPrincipal } from '../../sessions/session-principal';
import { isCredentialLinkMissing, isRegistryMissing } from '../schema-state';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleUnlink(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { deviceId } = await context.params;
  if (!UUID.test(deviceId)) {
    throw createError.validation('Invalid device ID');
  }

  const registered = await readRegisteredDevice(db, deviceId, userId);
  const result = await db.transaction(async (tx) => {
    const owned = registered
      ? [registered]
      : await tx.query<{ kind: string; name: string | null }>(
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
            and (
              family_id in (
                select family_id from device_refresh_tokens
                 where user_id = $2 and device_id = $1
              )
              or family_id = $3
            )
          returning id`,
        [deviceId, userId, registered?.credentialFamilyId ?? null],
      );
    } catch (error) {
      if (!isCredentialLinkMissing(error)) throw error;
      credentialsRevocable = false;
    }

    if (registered) {
      await tx.execute(`delete from device_registrations where id = $1 and user_id = $2`, [
        deviceId,
        userId,
      ]);
      if (registered.kind === 'mobile') {
        await tx.execute(`delete from mobile_devices where id::text = $1 and user_id = $2`, [
          registered.installId,
          userId,
        ]);
      }
    }
    await tx.execute(`delete from desktop_devices where id = $1 and user_id = $2`, [
      deviceId,
      userId,
    ]);
    await tx.execute(`delete from mobile_devices where id = $1 and user_id = $2`, [
      deviceId,
      userId,
    ]);

    return {
      kind: device.kind,
      name: device.name,
      revokedCredentials: revoked.length,
      credentialsRevocable,
      identitySessionId: registered?.identitySessionId ?? null,
    };
  });

  if (!result) {
    throw createError.notFound('Device not found');
  }

  const sessionRevoked = result.identitySessionId
    ? await revokeIdentitySession(result.identitySessionId, userId)
    : false;

  logger.info(
    { userId, kind: result.kind, revokedCredentials: result.revokedCredentials },
    'Linked device unlinked',
  );

  await notifyDeviceDisconnected(db, {
    userId,
    deviceId,
    kind: result.kind,
    name: result.name,
  });

  await recordAuditEvent({
    userId,
    eventType: 'session_revoked',
    request,
    detail: {
      resourceType: `device:${result.kind}`,
      source: 'unlink_device',
      count: result.revokedCredentials + (sessionRevoked ? 1 : 0),
    },
  });

  return NextResponse.json({
    message: 'Device unlinked',
    revokedCredentials: result.revokedCredentials + (sessionRevoked ? 1 : 0),
    credentialsRevoked: result.credentialsRevocable,
  });
}

async function handleRename(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { deviceId } = await context.params;
  if (!UUID.test(deviceId)) {
    throw createError.validation('Invalid device ID');
  }
  const parsed = DeviceRenameRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('A device name is 1 to 120 characters');
  }
  const { name } = parsed.data;

  let count = 0;
  try {
    count += await db.execute(
      `update device_registrations set name = $3, updated_at = now() where id = $1 and user_id = $2`,
      [deviceId, userId, name],
    );
  } catch (error) {
    if (!isRegistryMissing(error)) throw error;
  }
  if (count === 0) {
    count += await db.execute(
      `update desktop_devices set name = $3, updated_at = now() where id = $1 and user_id = $2`,
      [deviceId, userId, name],
    );
    count += await db.execute(
      `update mobile_devices set name = $3, updated_at = now() where id = $1 and user_id = $2`,
      [deviceId, userId, name],
    );
  }
  const renamed = count > 0;

  if (!renamed) {
    throw createError.notFound('Device not found');
  }

  await recordAuditEvent({
    userId,
    eventType: 'device_renamed',
    request,
    detail: { resourceType: 'device', resourceId: deviceId, source: 'rename_device' },
  });

  return NextResponse.json({ id: deviceId, name });
}

interface RegisteredDevice {
  kind: string;
  name: string | null;
  installId: string;
  credentialFamilyId: string | null;
  identitySessionId: string | null;
}

async function readRegisteredDevice(
  db: DatabaseAdapter,
  deviceId: string,
  userId: string,
): Promise<RegisteredDevice | null> {
  try {
    const rows = await db.query<{
      kind: string;
      name: string | null;
      install_id: string;
      credential_family_id: string | null;
      identity_session_id: string | null;
    }>(
      `select surface as kind, name, install_id, credential_family_id, identity_session_id
         from device_registrations where id = $1 and user_id = $2 limit 1`,
      [deviceId, userId],
    );
    const row = rows[0];
    return row
      ? {
          kind: row.kind,
          name: row.name,
          installId: row.install_id,
          credentialFamilyId: row.credential_family_id,
          identitySessionId: row.identity_session_id,
        }
      : null;
  } catch (error) {
    if (isRegistryMissing(error)) return null;
    throw error;
  }
}

async function revokeIdentitySession(sessionId: string, userId: string): Promise<boolean> {
  try {
    const identity = getIdentityProvider();
    const session = await identity.getSession(sessionId);
    if (!session || session.userId !== userId) return false;
    await identity.revokeSession(session.id);
    return true;
  } catch (error) {
    logger.warn({ error, userId }, 'Device identity session could not be revoked');
    return false;
  }
}

export const DELETE = withErrorHandler(handleUnlink);
export const PATCH = withErrorHandler(handleRename);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
