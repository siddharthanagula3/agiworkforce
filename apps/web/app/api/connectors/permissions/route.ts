import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
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

const UpsertSchema = z.object({
  connectorId: z.string().min(1).max(200),
  toolName: z.string().min(1).max(200),
  level: z.enum(['allow', 'ask', 'deny']),
  destructive: z.boolean().optional(),
});

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
    throw createError.validation('connectorId, toolName and a valid level are required');
  }
  const { connectorId, toolName, level } = parsed.data;

  // a destructiveness verdict is a safety property, not a caller preference.
  const destructive = isDestructiveConnectorTool(connectorId, toolName);

  const { db, userId } = await getUserScopedDb(request);
  await db.query(
    `insert into public.connector_tool_permissions
       (user_id, connector_id, tool_name, level, destructive, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id, connector_id, tool_name)
       do update set level = excluded.level,
                     destructive = excluded.destructive,
                     updated_at = now()`,
    [userId, connectorId, toolName, WIRE_TO_DB[level], destructive],
  );
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

  const { db, userId } = await getUserScopedDb(request);
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

  return NextResponse.json({ success: true, removed });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handleUpsert));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
