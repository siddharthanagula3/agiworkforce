import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  parentFolderId: z.string().uuid().optional(),
});

const UpdateFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  // For moving a conversation into a folder
  sessionId: z.string().uuid().optional(),
});

const DeleteFolderSchema = z.object({
  id: z.string().uuid(),
});

type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  description: string | null;
  parent_folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<FolderRow>(
    `select * from chat_folders
     where user_id = $1
     order by sort_order asc, name asc`,
    [userId],
  );

  return NextResponse.json({ folders: rows });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = CreateFolderSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { name, color, icon, description, parentFolderId } = parsed.data;

  const [row] = await db.query<FolderRow>(
    `insert into chat_folders (user_id, name, color, icon, description, parent_folder_id, sort_order)
     values ($1, $2, $3, $4, $5, $6, 0)
     returning *`,
    [userId, name, color ?? 'gray', icon ?? 'folder', description ?? null, parentFolderId ?? null],
  );

  return NextResponse.json({ folder: row }, { status: 201 });
}

async function handlePut(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = UpdateFolderSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { id, name, color, icon, description, parentFolderId, sortOrder, sessionId } = parsed.data;

  // Move session to folder (uses DB function)
  if (sessionId !== undefined) {
    await db.query<{ move_session_to_folder: null }>('select move_session_to_folder($1, $2)', [
      sessionId,
      id,
    ]);
    return NextResponse.json({ moved: true });
  }

  // Verify folder ownership
  const [existing] = await db.query<{ id: string }>(
    'select id from chat_folders where id = $1 and user_id = $2 limit 1',
    [id, userId],
  );
  if (!existing) throw createError.notFound('Folder not found');

  // Build the SET clause dynamically to only update provided fields
  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [id, userId];
  let paramIdx = 3;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    params.push(name);
  }
  if (color !== undefined) {
    setClauses.push(`color = $${paramIdx++}`);
    params.push(color);
  }
  if (icon !== undefined) {
    setClauses.push(`icon = $${paramIdx++}`);
    params.push(icon);
  }
  if (description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    params.push(description);
  }
  if (parentFolderId !== undefined) {
    setClauses.push(`parent_folder_id = $${paramIdx++}`);
    params.push(parentFolderId);
  }
  if (sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIdx++}`);
    params.push(sortOrder);
  }

  const [updated] = await db.query<FolderRow>(
    `update chat_folders set ${setClauses.join(', ')} where id = $1 and user_id = $2 returning *`,
    params,
  );

  return NextResponse.json({ folder: updated });
}

async function handleDelete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = DeleteFolderSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { id } = parsed.data;

  const affected = await db.execute('delete from chat_folders where id = $1 and user_id = $2', [
    id,
    userId,
  ]);

  if (affected === 0) {
    throw createError.notFound('Folder not found');
  }

  return NextResponse.json({ deleted: true });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const PUT = withErrorHandler(handlePut);
export const DELETE = withErrorHandler(handleDelete);
