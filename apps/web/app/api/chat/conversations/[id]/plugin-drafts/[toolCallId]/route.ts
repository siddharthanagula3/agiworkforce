import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PLUGIN_DRAFT_TOOL_NAME,
  readPluginDraftToolResult,
  type PluginDraft,
} from '@agiworkforce/cloud-contracts';
import {
  getCorsHeaders,
  getSecurityHeaders,
  handleCorsPreflightRequest,
  withCorsRoute,
} from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; toolCallId: string }> };

const DRAFT_NOT_FOUND = 'Draft not found';
const ToolCallIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_.:-]+$/);

interface StoredPluginDraftResponse {
  draft: PluginDraft;
}

async function handleGet(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const { id, toolCallId } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !ToolCallIdSchema.safeParse(toolCallId).success) {
    throw createError.notFound(DRAFT_NOT_FOUND);
  }

  const [row] = await db.query<{ output: unknown }>(
    `select e.envelope -> 'event' -> 'output' as output
       from web_conversations c
       join cloud_agent_runs r
         on r.conversation_id = c.id
        and r.user_id = c.user_id
       join cloud_agent_events e
         on e.run_id = r.id
        and e.user_id = r.user_id
      where c.id = $1
        and c.user_id = $2
        and c.organization_id is not distinct from $3
        and c.deleted_at is null
        and e.event_type = 'tool-execution-end'
        and e.envelope -> 'event' ->> 'toolCallId' = $4
        and e.envelope -> 'event' ->> 'name' = $5
        and e.envelope -> 'event' ->> 'isError' = 'false'
      order by e.sequence desc
      limit 1`,
    [id, userId, organizationId, toolCallId, PLUGIN_DRAFT_TOOL_NAME],
  );
  const draft = row ? readPluginDraftToolResult(PLUGIN_DRAFT_TOOL_NAME, row.output) : null;
  if (!draft) throw createError.notFound(DRAFT_NOT_FOUND);

  const body: StoredPluginDraftResponse = { draft };
  return NextResponse.json(body, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
      'Cache-Control': 'private, no-store',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
