import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const AddBookmarkSchema = z.object({
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  note: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const DeleteBookmarkSchema = z.object({
  messageId: z.string().uuid(),
});

type BookmarkRow = {
  id: string;
  user_id: string;
  session_id: string;
  message_id: string;
  note: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type BookmarkedMessageRow = {
  id: string | null;
  user_id: string | null;
  session_id: string | null;
  message_id: string | null;
  bookmark_note: string | null;
  bookmark_tags: string[] | null;
  bookmarked_at: string | null;
  message_role: string | null;
  message_content: string | null;
  message_created_at: string | null;
  session_title: string | null;
  session_created_at: string | null;
};

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (sessionId) {
    // Get bookmarks for a specific session
    const rows = await db.query<BookmarkedMessageRow>(
      `select * from bookmarked_messages
       where user_id = $1 and session_id = $2
       order by message_created_at asc`,
      [userId, sessionId],
    );
    return NextResponse.json({ bookmarks: rows });
  }

  // Get all bookmarks for user
  const rows = await db.query<BookmarkedMessageRow>(
    `select * from bookmarked_messages
     where user_id = $1
     order by bookmarked_at desc`,
    [userId],
  );

  return NextResponse.json({ bookmarks: rows });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = AddBookmarkSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { sessionId, messageId, note, tags } = parsed.data;

  const [existing] = await db.query<{ id: string }>(
    'select id from message_bookmarks where user_id = $1 and message_id = $2 limit 1',
    [userId, messageId],
  );

  if (existing) {
    // Update existing bookmark
    const [updated] = await db.query<BookmarkRow>(
      `update message_bookmarks
       set note = $3, tags = $4, updated_at = now()
       where user_id = $1 and message_id = $2
       returning id, user_id, session_id, message_id, note, tags, created_at, updated_at`,
      [userId, messageId, note ?? null, tags ?? []],
    );
    return NextResponse.json({ bookmark: updated, created: false });
  }

  const [row] = await db.query<BookmarkRow>(
    `insert into message_bookmarks (user_id, session_id, message_id, note, tags)
     values ($1, $2, $3, $4, $5)
     returning id, user_id, session_id, message_id, note, tags, created_at, updated_at`,
    [userId, sessionId, messageId, note ?? null, tags ?? []],
  );

  return NextResponse.json({ bookmark: row, created: true }, { status: 201 });
}

async function handleDelete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = DeleteBookmarkSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { messageId } = parsed.data;

  const affected = await db.execute(
    'delete from message_bookmarks where user_id = $1 and message_id = $2',
    [userId, messageId],
  );

  if (affected === 0) {
    throw createError.notFound('Bookmark not found');
  }

  return NextResponse.json({ deleted: true });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
