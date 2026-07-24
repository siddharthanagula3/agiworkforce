import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

/**
 * Connector per-tool permission persistence (server-owned, cross-device).
 *
 *   GET  /api/connectors/permissions        - the user's saved allow/ask/deny
 *                                             verdicts for every connector tool
 *   PUT  /api/connectors/permissions        - upsert one verdict
 *
 * Backs the web tool-permissions store (previously localStorage-only, so a
 * "block this tool" verdict didn't follow the user across devices and had no
 * server persistence). The generic per-invocation approval gate stays enforced
 * server-side in the tool loop regardless — this persists the *remembered*
 * policy. Owner-scoped by the Clerk user id (connector_tool_permissions is
 * keyed unique on user_id, connector_id, tool_name; migration 0008).
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
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
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = UpsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('connectorId, toolName and a valid level are required');
  }
  const { connectorId, toolName, level, destructive } = parsed.data;

  const db = getNeonDb();
  await db.query(
    `insert into public.connector_tool_permissions
       (user_id, connector_id, tool_name, level, destructive, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id, connector_id, tool_name)
       do update set level = excluded.level,
                     destructive = excluded.destructive,
                     updated_at = now()`,
    [userId, connectorId, toolName, WIRE_TO_DB[level], destructive ?? false],
  );
  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handleUpsert));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
