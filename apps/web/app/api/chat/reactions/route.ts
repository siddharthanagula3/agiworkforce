import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const ToggleReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(10),
});

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type AggregatedRow = {
  message_id: string;
  emoji: string;
  reaction_count: number;
  user_ids: string[];
  user_reacted: boolean;
};

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = ToggleReactionSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { messageId, emoji } = parsed.data;

  const [existing] = await db.query<{ id: string }>(
    'select id from message_reactions where user_id = $1 and message_id = $2 and emoji = $3 limit 1',
    [userId, messageId, emoji],
  );

  if (existing) {
    await db.execute(
      'delete from message_reactions where user_id = $1 and message_id = $2 and emoji = $3',
      [userId, messageId, emoji],
    );
    return NextResponse.json({ added: false });
  }

  const [row] = await db.query<ReactionRow>(
    'insert into message_reactions (user_id, message_id, emoji) values ($1, $2, $3) returning id, message_id, user_id, emoji, created_at',
    [userId, messageId, emoji],
  );

  return NextResponse.json({
    added: true,
    reaction: row
      ? {
          id: row.id,
          messageId: row.message_id,
          userId: row.user_id,
          emoji: row.emoji,
          createdAt: row.created_at,
        }
      : null,
  });
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const messageIdsParam = url.searchParams.get('messageIds');
  if (!messageIdsParam) throw createError.validation('messageIds query param required');

  const messageIds = messageIdsParam.split(',').filter(Boolean);
  if (messageIds.length === 0 || messageIds.length > 100) {
    throw createError.validation('1-100 message IDs required');
  }

  // IDOR guard: only return reactions for messages in conversations the caller
  // OWNS. Without the join to web_conversations, any user could read reaction
  // counts and reactor user IDs for arbitrary message IDs they don't own.
  const rows = await db.query<AggregatedRow>(
    `select
       mr.message_id,
       mr.emoji,
       count(*)::int as reaction_count,
       array_agg(mr.user_id) as user_ids,
       bool_or(mr.user_id = $1) as user_reacted
     from message_reactions mr
     join web_messages wm on wm.id = mr.message_id
     join web_conversations wc on wc.id = wm.conversation_id
     where mr.message_id = any($2::uuid[])
       and wc.user_id = $1
     group by mr.message_id, mr.emoji
     order by reaction_count desc`,
    [userId, messageIds],
  );

  const grouped: Record<
    string,
    Array<{ emoji: string; count: number; userIds: string[]; userReacted: boolean }>
  > = {};
  for (const r of rows) {
    if (!grouped[r.message_id]) grouped[r.message_id] = [];
    grouped[r.message_id]!.push({
      emoji: r.emoji,
      count: r.reaction_count,
      userIds: r.user_ids || [],
      userReacted: r.user_reacted || false,
    });
  }

  return NextResponse.json({ reactions: grouped });
}

export const POST = withErrorHandler(handlePost);
export const GET = withErrorHandler(handleGet);
