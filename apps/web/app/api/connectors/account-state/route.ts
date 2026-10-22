import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES,
  SetConnectorAccountStateRequestSchema,
  type ConnectorAccountStateResponse,
  type SetConnectorAccountStateResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { readDisabledConnectorIds } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const disabledConnectorIds = await readDisabledConnectorIds(db, userId);
  return NextResponse.json({
    disabledConnectorIds: [...disabledConnectorIds].sort(),
  } satisfies ConnectorAccountStateResponse);
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = SetConnectorAccountStateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('A connectorId and an enabled flag are required');
  }
  const { connectorId, enabled } = parsed.data;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rows = await db.query<{ connector_id: string; enabled: boolean }>(
    `insert into public.connector_account_states (user_id, connector_id, enabled)
     select $1, $2, $3
      where (select count(*)
               from public.connector_account_states
              where user_id = $1 and connector_id <> $2) < $4
     on conflict (user_id, connector_id)
       do update set enabled = excluded.enabled
     returning connector_id, enabled`,
    [userId, connectorId, enabled, CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES],
  );
  const saved = rows[0];
  if (!saved) {
    throw createError.validation(
      `Only ${CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES} connectors can be switched on or off. Disconnect one you no longer use.`,
    );
  }

  await recordAuditEvent({
    userId,
    organizationId,
    request,
    eventType: 'connector_setting_changed',
    detail: {
      resourceType: 'connector',
      resourceId: connectorId,
      connectorId,
      status: saved.enabled ? 'enabled' : 'disabled',
    },
  });

  return NextResponse.json({
    connectorId: saved.connector_id,
    enabled: saved.enabled,
  } satisfies SetConnectorAccountStateResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handlePut));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
