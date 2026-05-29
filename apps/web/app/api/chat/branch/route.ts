import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const BranchConversationSchema = z.object({
  sessionId: z.string().uuid(),
  branchPointMessageId: z.string().uuid(),
  branchName: z.string().max(200).optional(),
});

type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};

type BranchRow = {
  id: string;
  parent_session_id: string;
  child_session_id: string;
  branch_point_message_id: string;
  branch_name: string | null;
  created_by: string | null;
  created_at: string;
};

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = BranchConversationSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { sessionId, branchPointMessageId, branchName } = parsed.data;

  // Verify the session belongs to the user
  const [originalSession] = await db.query<ConversationRow>(
    'select id, title from web_conversations where id = $1 and user_id = $2 and deleted_at is null limit 1',
    [sessionId, userId],
  );
  if (!originalSession) throw createError.notFound('Session not found');

  // Get messages up to and including the branch point
  const allMessages = await db.query<MessageRow>(
    `select id, conversation_id, role, content, created_at
     from web_messages
     where conversation_id = $1
     order by created_at asc`,
    [sessionId],
  );

  const branchPointIndex = allMessages.findIndex((m) => m.id === branchPointMessageId);
  if (branchPointIndex === -1) throw createError.notFound('Branch point message not found');

  const messagesToCopy = allMessages.slice(0, branchPointIndex + 1);

  // Build branch title
  const branchTitle =
    branchName ?? `${originalSession.title ?? 'Untitled'} (Branch ${branchPointIndex + 1})`;

  // Create the new session and copy messages inside a transaction
  const result = await db.transaction(async (tx) => {
    // Create new conversation
    const [branchSession] = await tx.query<ConversationRow>(
      `insert into web_conversations (user_id, title, created_at, updated_at)
       values ($1, $2, now(), now())
       returning id, user_id, title, created_at, updated_at`,
      [userId, branchTitle],
    );

    if (!branchSession) throw createError.internal('Failed to create branch session');

    // Copy messages
    for (const msg of messagesToCopy) {
      await tx.execute(
        `insert into web_messages (conversation_id, role, content, created_at)
         values ($1, $2, $3, now())`,
        [branchSession.id, msg.role, msg.content],
      );
    }

    // Save branch metadata
    const [branchMeta] = await tx.query<BranchRow>(
      `insert into conversation_branches
         (parent_session_id, child_session_id, branch_point_message_id, branch_name, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, parent_session_id, child_session_id, branch_point_message_id, branch_name, created_by, created_at`,
      [sessionId, branchSession.id, branchPointMessageId, branchName ?? null, userId],
    );

    return { session: branchSession, branch: branchMeta };
  });

  return NextResponse.json(
    {
      session: result.session,
      branch: result.branch,
    },
    { status: 201 },
  );
}

export const POST = withErrorHandler(handlePost);
