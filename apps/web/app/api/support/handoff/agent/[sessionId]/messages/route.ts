import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { createError } from '@/lib/errors';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { redactSecrets } from '@/lib/support/handoff/transcript';
import {
  appendHandoffMessage,
  getSessionById,
  listHandoffMessages,
} from '@/lib/support/handoff/store';

type RouteContext = { params: Promise<{ sessionId: string }> };

const PostSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

async function handleAgentList(request: NextRequest, context: RouteContext) {
  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requirePlatformAdmin(request);
  const { sessionId } = await context.params;

  const session = await getSessionById(sessionId);
  if (!session || session.agent_user_id !== userId) {
    throw createError.notFound('Support request not found');
  }

  const afterRaw = Number.parseInt(request.nextUrl.searchParams.get('after') ?? '0', 10);
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;
  const rows = await listHandoffMessages(sessionId, after, 100);
  const messages = rows.map((row) => ({
    seq: Number(row.seq),
    author: row.author,
    body: row.body,
    at: row.created_at,
  }));

  return NextResponse.json(
    {
      sessionId,
      status: session.status,
      messages,
      nextAfter: messages.length ? messages[messages.length - 1]!.seq : after,
      pollIntervalMs: getHandoffConfig().pollIntervalMs,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

async function handleAgentPost(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requirePlatformAdmin(request);
  const { sessionId } = await context.params;

  const session = await getSessionById(sessionId);
  if (!session || session.agent_user_id !== userId) {
    throw createError.notFound('Support request not found');
  }
  if (session.status !== 'connected') {
    throw createError.conflict(`That request is ${session.status}`);
  }

  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid message');

  const row = await appendHandoffMessage({
    sessionId,
    author: 'agent',
    body: redactSecrets(parsed.data.body),
  });
  if (!row) throw createError.internal('Could not send that message');

  return NextResponse.json({
    message: { seq: Number(row.seq), author: row.author, body: row.body, at: row.created_at },
  });
}

export const GET = withErrorHandler(handleAgentList);
export const POST = withErrorHandler(handleAgentPost);
