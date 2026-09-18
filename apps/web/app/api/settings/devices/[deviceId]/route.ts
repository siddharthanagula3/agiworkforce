import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import { revokeDeviceRefreshCredentials } from '@/lib/server/refresh-token-family';
import { revokeEveryOtherSession } from '@/lib/server/session-revocation';
import { resolveSessionsPrincipal } from '../../sessions/session-principal';
import { isCredentialLinkMissing, isRegistryMissing } from '../schema-state';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `lost` finishes the credential family for good rather than merely revoking
 * it; `logoutAll` is offered here because that is where the user already is.
 */
const UnlinkOptionsSchema = z
  .object({
    lost: z.boolean().optional(),
    logoutAll: z.boolean().optional(),
  })
  .strict();

interface UnlinkOptions {
  lost: boolean;
  logoutAll: boolean;
}

async function readUnlinkOptions(request: NextRequest): Promise<UnlinkOptions> {
  const raw: unknown = await request.json().catch(() => null);
  if (raw === null || raw === undefined) return { lost: false, logoutAll: false };

  const parsed = UnlinkOptionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw createError.validation('Invalid unlink options', parsed.error.flatten());
  }
  return { lost: parsed.data.lost ?? false, logoutAll: parsed.data.logoutAll ?? false };
}

/**
 * Its own statement, before the delete: deleting the row removes the record of
 * the authorization, this removes the authorization.
 */
async function revokeRemoteControl(
  db: DatabaseAdapter,
  deviceId: string,
  userId: string,
): Promise<boolean> {
  try {
    const affected = await db.execute(
      `update device_registrations
          set remote_enabled = false, updated_at = now()
        where id = $1 and user_id = $2`,
      [deviceId, userId],
    );
    return affected > 0;
  } catch (error) {
    if (isRegistryMissing(error)) return false;
    throw error;
  }
}

async function handleUnlink(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, currentSessionId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { deviceId } = await context.params;
  if (!UUID.test(deviceId)) {
    throw createError.validation('Invalid device ID');
  }
  const options = await readUnlinkOptions(request);

  const registered = await readRegisteredDevice(db, deviceId, userId);
  const remoteControlRevoked = registered ? await revokeRemoteControl(db, deviceId, userId) : false;
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

    // Until 0133 lands there is no device_id to scope by. Revoking every family
    // on the account would sign out the user's other devices to unlink one, so
    // this unregisters and says plainly that no credential was revoked.
    let revoked = 0;
    let compromiseRecorded = false;
    let credentialsRevocable = true;
    try {
      const outcome = await revokeDeviceRefreshCredentials(tx, {
        userId,
        deviceId,
        credentialFamilyId: registered?.credentialFamilyId ?? null,
        ...(options.lost ? { compromisedAs: 'device_lost' as const } : {}),
      });
      revoked = outcome.revoked;
      compromiseRecorded = outcome.compromiseRecorded;
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
      revokedCredentials: revoked,
      compromiseRecorded,
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

  const loggedOutEverywhere = options.logoutAll
    ? await endEverySession(db, userId, currentSessionId)
    : null;

  logger.info(
    {
      userId,
      kind: result.kind,
      revokedCredentials: result.revokedCredentials,
      lost: options.lost,
      logoutAll: options.logoutAll,
    },
    'Linked device unlinked',
  );

  await notifyDeviceDisconnected(db, {
    userId,
    deviceId,
    kind: result.kind,
    name: result.name,
  });

  const source = options.lost ? 'lost_device' : 'unlink_device';

  await recordAuditEvent({
    userId,
    eventType: 'device_trust_revoked',
    request,
    detail: {
      resourceType: `device:${result.kind}`,
      resourceId: deviceId,
      source,
      trusted: false,
      enabled: remoteControlRevoked ? false : undefined,
    },
  });

  if (result.compromiseRecorded) {
    await recordAuditEvent({
      userId,
      eventType: 'refresh_family_compromised',
      request,
      severity: 'critical',
      detail: {
        resourceType: `device:${result.kind}`,
        resourceId: deviceId,
        source,
        reason: 'device_lost',
        count: result.revokedCredentials,
      },
    });
  }

  await recordAuditEvent({
    userId,
    eventType: 'session_revoked',
    request,
    detail: {
      resourceType: `device:${result.kind}`,
      source,
      count:
        result.revokedCredentials + (sessionRevoked ? 1 : 0) + (loggedOutEverywhere?.ended ?? 0),
    },
  });

  return NextResponse.json({
    message: options.lost ? 'Device reported lost and unlinked' : 'Device unlinked',
    revokedCredentials: result.revokedCredentials + (sessionRevoked ? 1 : 0),
    credentialsRevoked: result.credentialsRevocable,
    credentialFamilyCompromised: result.compromiseRecorded,
    remoteControlRevoked,
    ...(loggedOutEverywhere ? { loggedOutEverywhere } : {}),
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

interface LogoutEverywhere {
  ended: number;
  failed: number;
  incomplete: boolean;
}

// The caller's own session survives; every other session and refresh credential ends.
async function endEverySession(
  db: DatabaseAdapter,
  userId: string,
  currentSessionId: string | null,
): Promise<LogoutEverywhere> {
  const sweep = await revokeEveryOtherSession(getIdentityProvider(), userId, currentSessionId);
  await db.execute(
    `update device_refresh_tokens
        set revoked_at = coalesce(revoked_at, now())
      where user_id = $1
        and revoked_at is null`,
    [userId],
  );

  return {
    ended: sweep.ended.length + sweep.alreadyGone.length,
    failed: sweep.failed.length,
    incomplete: sweep.incomplete,
  };
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
