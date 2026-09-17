import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DeviceHeartbeatRequestSchema,
  type DeviceHeartbeatResponse,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsAndSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveDeviceCredentialLink } from '@/lib/server/device-credential-link';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const UPSERT = `
  insert into public.device_registrations
    (user_id, organization_id, surface, install_id, name, os, os_version, architecture,
     app_version, shell, browser_available, computer_use_available, local_models_available,
     local_mcp_available, remote_enabled, credential_family_id, identity_session_id,
     last_seen_at, updated_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
  on conflict (user_id, surface, install_id) do update set
    organization_id = excluded.organization_id,
    name = coalesce(public.device_registrations.name, excluded.name),
    os = excluded.os,
    os_version = excluded.os_version,
    architecture = excluded.architecture,
    app_version = excluded.app_version,
    shell = excluded.shell,
    browser_available = excluded.browser_available,
    computer_use_available = excluded.computer_use_available,
    local_models_available = excluded.local_models_available,
    local_mcp_available = excluded.local_mcp_available,
    remote_enabled = excluded.remote_enabled,
    credential_family_id = coalesce(excluded.credential_family_id, public.device_registrations.credential_family_id),
    identity_session_id = coalesce(excluded.identity_session_id, public.device_registrations.identity_session_id),
    last_seen_at = now(),
    updated_at = now()
  returning id`;

async function handleHeartbeat(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-heartbeat');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = DeviceHeartbeatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid device heartbeat', parsed.error.flatten());
  }
  const heartbeat = parsed.data;
  const link = await resolveDeviceCredentialLink(request, userId);

  const rows = await db.query<{ id: string }>(UPSERT, [
    userId,
    organizationId,
    heartbeat.surface,
    heartbeat.installId,
    heartbeat.name ?? null,
    heartbeat.os,
    heartbeat.osVersion ?? null,
    heartbeat.architecture ?? null,
    heartbeat.appVersion ?? null,
    heartbeat.shell ?? null,
    heartbeat.capabilities.browser,
    heartbeat.capabilities.computerUse,
    heartbeat.capabilities.localModels,
    heartbeat.capabilities.localMcp,
    heartbeat.capabilities.remoteControl,
    link.credentialFamilyId,
    link.identitySessionId,
  ]);
  const deviceId = rows[0]?.id;
  if (!deviceId) throw createError.internal('Could not record this device');

  const body: DeviceHeartbeatResponse = {
    deviceId,
    nextHeartbeatInMs: DEVICE_HEARTBEAT_INTERVAL_MS,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const postHeartbeat = withErrorHandler(handleHeartbeat);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await postHeartbeat(request);
  return withCorsAndSecurityHeaders(response as NextResponse, request);
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
