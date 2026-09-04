import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

/**
 * The account-wide artifact index (migration 0121).
 *
 *   GET /api/artifacts/index        - newest indexed artifacts for the caller
 *   GET /api/artifacts/index?limit= - bounded page
 *
 * Read-only. Rows are written by the message-persist route as assistant
 * messages land (`lib/index-artifacts.ts`), never by a client.
 *
 * This returns METADATA ONLY: no `content`, because the index deliberately
 * does not store any. An artifact's bytes live in the message that produced it
 * and are re-derived on demand under the same deterministic id, so the client
 * merges these rows with its locally-derived set by identity.
 *
 * Every query runs through `getUserScopedDb`, so 0120's FORCE'd RLS policy
 * enforces isolation in the DATABASE rather than only in this WHERE clause.
 */

export const runtime = 'nodejs';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

interface ArtifactIndexRow {
  id: string;
  conversation_id: string;
  message_id: string;
  title: string | null;
  artifact_type: string;
  language: string | null;
  created_at: Date | string;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.badRequest('Invalid artifact index query', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);
  const limit = parsed.data.limit ?? 200;

  const rows = await db.query<ArtifactIndexRow>(
    `select id, conversation_id, message_id, title, artifact_type, language, created_at
       from web_artifact_index
      where user_id = $1
      order by created_at desc
      limit $2`,
    [userId, limit],
  );

  return NextResponse.json({
    artifacts: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      messageId: r.message_id,
      title: r.title,
      type: r.artifact_type,
      language: r.language,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
