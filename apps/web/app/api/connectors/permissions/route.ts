import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
} as const;
const DB_TO_WIRE: Record<string, 'allow' | 'ask' | 'deny'> = {
  'always-allow': 'allow',
  'needs-approval': 'ask',
  blocked: 'deny',
};

const MAX_TOOLS_PER_WRITE = 200;

const UpsertSchema = z
  .object({
    connectorId: z.string().min(1).max(200),
    toolName: z.string().min(1).max(200).optional(),
    toolNames: z.array(z.string().min(1).max(200)).min(1).max(MAX_TOOLS_PER_WRITE).optional(),
    level: z.enum(['allow', 'ask', 'deny']),
    destructive: z.boolean().optional(),
  })
  .refine((body) => (body.toolName === undefined) !== (body.toolNames === undefined));

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
  return NextResponse.json({ permissions });
}

async function handleUpsert(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = UpsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(
      'connectorId, one of toolName or toolNames, and a valid level are required',
    );
  }
  const { connectorId, level } = parsed.data;
  const toolNames = [...new Set(parsed.data.toolNames ?? [parsed.data.toolName!])];
  const auditName = toolNames.length === 1 ? toolNames[0]! : `${toolNames.length} tools`;

  // a destructiveness verdict is a safety property, not a caller preference.
  const destructiveFlags = toolNames.map((name) => isDestructiveConnectorTool(connectorId, name));
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
  return NextResponse.json({ success: true, destructive });
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

  return NextResponse.json({ success: true, removed });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handleUpsert));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
