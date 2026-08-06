/**
 * GET  /api/support/handoff/[sessionId]/messages?after=<seq> — poll for new turns.
 * POST /api/support/handoff/[sessionId]/messages — the user sends a turn.
 *
 * POLLING, NOT SOCKETS — stated plainly rather than hidden. `services/signaling-
 * server` is a separately-deployed device-pairing WS relay (its own Dockerfile,
 * fly.toml, database, and an internal-shared-secret pairing-code handshake); its
 * README says it is not imported by apps or packages. Bending it into browser
 * support chat would mean deploying a second service and inventing a pairing
 * dance for a session that already has a Clerk identity. Vercel serverless also
 * cannot hold a socket open. So both sides poll at the server-dictated
 * `pollIntervalMs`, and the honest cost is written down in the workstream report.
 *
 * Messages are only accepted while the session is `connected` — there is no way
 * to type into a session that no human ever joined.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { redactSecrets } from '@/lib/support/handoff/transcript';
import {
  appendHandoffMessage,
  getSessionForOwner,
  listHandoffMessages,
} from '@/lib/support/handoff/store';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';
import type { HandoffMessage, HandoffMessagesResponse } from '@/lib/support/handoff/types';

type RouteContext = { params: Promise<{ sessionId: string }> };

const MESSAGE_PAGE_SIZE = 100;

const PostSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

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

  const { sessionId } = await context.params;
  const identity = await resolveHandoffIdentity(request);

  const session = await getSessionForOwner(sessionId, identity.ownerSessionKey);
  if (!session) throw createError.notFound('Support request not found');
  if (session.status !== 'connected') {
    throw createError.conflict('This conversation is not connected to a person');
  }

  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid message');

  // Redact before write: a user pasting their own key into a live chat must not
  // put it in the database, and the live transcript can still be emailed later.
  const row = await appendHandoffMessage({
    sessionId,
    author: 'user',
    body: redactSecrets(parsed.data.body),
  });
  if (!row) throw createError.internal('Could not send that message');

  return NextResponse.json({ message: toMessage(row) });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handlePost);
