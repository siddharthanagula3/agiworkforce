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

/**
 * Connector per-tool permission persistence (server-owned, cross-device).
 *
 *   GET    /api/connectors/permissions      - the user's saved allow/ask/deny
 *                                             verdicts for every connector tool
 *   PUT    /api/connectors/permissions      - upsert one verdict
 *   DELETE /api/connectors/permissions      - revoke a verdict (CON-5), for one
 *                                             tool or a whole connector
 *
 * Backs the web tool-permissions store (previously localStorage-only, so a
 * "block this tool" verdict didn't follow the user across devices and had no
 * server persistence). Owner-scoped by the Clerk user id
 * (connector_tool_permissions is keyed unique on user_id, connector_id,
 * tool_name; migration 0008, RLS added in 0069).
 *
 * AUDIT-FIX CON-1: the claim that "the generic per-invocation approval gate
 * stays enforced server-side in the tool loop regardless" WAS NOT TRUE when it
 * was written — nothing on the server read this table, and enforcement lived
 * entirely in the browser. The tool loop now loads these verdicts and enforces
 * them before execution on both the initial loop and the /approve resume path
 * (see lib/connector-tool-permissions.ts).
 *
 * The wire vocabulary is the composer's (allow | ask | deny); the table stores
 * the canonical (always-allow | needs-approval | blocked). Mapping happens here
 * so the client stays in one vocabulary.
 */

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
  // Accepted for wire compatibility with older clients and IGNORED (CON-9):
  // destructiveness is derived server-side from the tool metadata model.
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

  // AUDIT-FIX CON-4: this queried through the UNSCOPED `getNeonDb()` (a
  // BYPASSRLS connection) with an app-layer `where user_id = $1` as the only
  // tenant boundary — the same pattern every other connector route already
  // moved off. `getUserScopedDb` binds the verified Clerk subject and runs as
  // the non-BYPASSRLS `app_rls` role, so migration 0069's policy enforces
  // isolation in the DATABASE, not merely in this WHERE clause.
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

  // AUDIT-FIX CON-9: `destructive` was written straight from the request body,
  // and the live web client never sends the field — so the column was `false`
  // for every row ever written, including `post_issue_comment`. It is now
  // DERIVED server-side from the declared tool metadata model
  // (lib/tool-metadata.ts) and the client-supplied value is ignored entirely:
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

/**
 * AUDIT-FIX CON-5: revoke a saved verdict.
 *
 * The route exposed only GET and PUT, and no other surface in the product
 * deletes these rows — so a user who clicked "Always allow" once could never
 * take it back from anywhere in the product. PUT with `level: "ask"` writes a
 * row rather than removing one, which is not the same thing: it pins the tool
 * to the prompt forever instead of restoring the default. DELETE removes the
 * row so the tool returns to the turn's normal approval behaviour.
 *
 *   DELETE /api/connectors/permissions?connectorId=github&toolName=post_issue_comment
 *   DELETE /api/connectors/permissions?connectorId=github    (whole connector)
 */
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
