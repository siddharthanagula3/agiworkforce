import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  UpsertConnectorToolPermissionRequestSchema,
  connectorCategoryToolName,
  isConnectorCategoryToolName,
  type ConnectorToolPermissionLevel,
  type DeleteConnectorToolPermissionsResponse,
  type ListConnectorToolPermissionsResponse,
  type UpsertConnectorToolPermissionResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isDestructiveConnectorTool } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';

export const runtime = 'nodejs';

const WIRE_TO_DB = {
  allow: 'always-allow',
  ask: 'needs-approval',
  deny: 'blocked',
} as const satisfies Record<ConnectorToolPermissionLevel, string>;
const DB_TO_WIRE: Record<string, ConnectorToolPermissionLevel> = {
  'always-allow': 'allow',
  'needs-approval': 'ask',
  blocked: 'deny',
};

type PermissionRow = {
  connector_id: string;
  tool_name: string;
  level: string;
};

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const rows = await db.query<PermissionRow>(
    `select connector_id, tool_name, level
       from public.connector_tool_permissions
      where user_id = $1`,
    [userId],
  );
  const permissions = rows.map((r) => ({
    connectorId: r.connector_id,
    toolName: r.tool_name,
    level: DB_TO_WIRE[r.level] ?? 'ask',
  }));
  return NextResponse.json({ permissions } satisfies ListConnectorToolPermissionsResponse);
}

async function handleUpsert(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = UpsertConnectorToolPermissionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation(
      'connectorId, a category or one of toolName or toolNames, and a valid level are required',
    );
  }
  const { connectorId, level, category } = parsed.data;
  const listed = [
    ...new Set(parsed.data.toolNames ?? (parsed.data.toolName ? [parsed.data.toolName] : [])),
  ];
  const toolNames = category ? [...listed, connectorCategoryToolName(category)] : listed;
  const auditName = category
    ? connectorCategoryToolName(category)
    : toolNames.length === 1
      ? toolNames[0]!
      : `${toolNames.length} tools`;

  // a destructiveness verdict is a safety property, not a caller preference.
  const destructiveFlags = toolNames.map((name) =>
    isConnectorCategoryToolName(name)
      ? category === 'write'
      : isDestructiveConnectorTool(connectorId, name),
  );
  const destructive = destructiveFlags.some(Boolean);

  const { db, userId, organizationId } = await getUserScopedDb(request);
  await db.query(
    `insert into public.connector_tool_permissions
       (user_id, connector_id, tool_name, level, destructive, updated_at)
     select $1, $2, tool.name, $4, tool.destructive, now()
       from unnest($3::text[], $5::boolean[]) as tool(name, destructive)
     on conflict (user_id, connector_id, tool_name)
       do update set level = excluded.level,
                     destructive = excluded.destructive,
                     updated_at = now()`,
    [userId, connectorId, toolNames, WIRE_TO_DB[level], destructiveFlags],
  );
  await recordAuditEvent({
    userId,
    organizationId,
    request,
    eventType: 'connector_setting_changed',
    detail: {
      resourceType: 'connector',
      resourceId: connectorId,
      connectorId,
      resourceName: auditName,
      status: level,
    },
  });
  return NextResponse.json({
    success: true,
    destructive,
  } satisfies UpsertConnectorToolPermissionResponse);
}

async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId');
  const toolName = url.searchParams.get('toolName');
  if (!connectorId || connectorId.length > 200) {
    throw createError.validation('connectorId query param is required');
  }
  if (toolName !== null && (toolName.length === 0 || toolName.length > 200)) {
    throw createError.validation('toolName must be a non-empty tool name when provided');
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const removed = toolName
    ? await db.execute(
        `delete from public.connector_tool_permissions
          where user_id = $1 and connector_id = $2 and tool_name = $3`,
        [userId, connectorId, toolName],
      )
    : await db.execute(
        `delete from public.connector_tool_permissions
          where user_id = $1 and connector_id = $2`,
        [userId, connectorId],
      );

  await recordAuditEvent({
    userId,
    organizationId,
    request,
    eventType: 'connector_setting_changed',
    detail: {
      resourceType: 'connector',
      resourceId: connectorId,
      connectorId,
      ...(toolName ? { resourceName: toolName } : {}),
      status: 'permission_removed',
      count: removed,
    },
  });

  return NextResponse.json({
    success: true,
    removed,
  } satisfies DeleteConnectorToolPermissionsResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handleUpsert));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
