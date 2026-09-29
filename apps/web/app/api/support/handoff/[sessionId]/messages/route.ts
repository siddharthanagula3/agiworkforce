import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { redactTranscriptText } from '@/lib/support/handoff/transcript';
import {
  appendHandoffMessage,
  getSessionForOwner,
  listHandoffMessages,
} from '@/lib/support/handoff/store';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';
import {
  type HandoffMessage,
  type HandoffMessagesResponse,
  SupportHandoffMessageRequestSchema,
} from '@agiworkforce/cloud-contracts/support';

type RouteContext = { params: Promise<{ sessionId: string }> };

const MESSAGE_PAGE_SIZE = 100;

function toMessage(row: {
  seq: string | number;
  author: 'user' | 'agent' | 'system';
  body: string;
  created_at: string;
}): HandoffMessage {
  return {
    seq: Number(row.seq),
    author: row.author,
    body: row.body,
    at: row.created_at,
  };
}

async function handleList(request: NextRequest, context: RouteContext) {
  const limited = await withRateLimit(request, 'support-handoff-message');
  if (limited) return limited;

  const { sessionId } = await context.params;
  const identity = await resolveHandoffIdentity(request);

  const session = await getSessionForOwner(sessionId, identity.ownerSessionKey);
  if (!session) throw createError.notFound('Support request not found');

  const afterRaw = Number.parseInt(request.nextUrl.searchParams.get('after') ?? '0', 10);
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;

  const rows = await listHandoffMessages(sessionId, after, MESSAGE_PAGE_SIZE);
  const messages = rows.map(toMessage);

  const payload: HandoffMessagesResponse = {
    sessionId,
    status: session.status,
    messages,
    nextAfter: messages.length ? messages[messages.length - 1]!.seq : after,
    pollIntervalMs: getHandoffConfig().pollIntervalMs,
  };
  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
}

async function handlePost(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-message');
  if (limited) return limited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportHandoffMessage);

  const { sessionId } = await context.params;
  const identity = await resolveHandoffIdentity(request);

  const session = await getSessionForOwner(sessionId, identity.ownerSessionKey);
  if (!session) throw createError.notFound('Support request not found');
  if (session.status !== 'connected') {
    throw createError.conflict('This conversation is not connected to a person');
  }

  const parsed = SupportHandoffMessageRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) throw createError.badRequest('Invalid message');

  const row = await appendHandoffMessage({
    sessionId,
    author: 'user',
    body: redactTranscriptText(parsed.data.body),
  });
  if (!row) throw createError.internal('Could not send that message');

  return NextResponse.json({ message: toMessage(row) });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handlePost);
