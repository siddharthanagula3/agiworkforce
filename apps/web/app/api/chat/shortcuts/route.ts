import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const ShortcutCategorySchema = z.enum(['coding', 'writing', 'business', 'analysis', 'creative']);

const CreateShortcutSchema = z.object({
  label: z.string().min(1).max(100),
  prompt: z.string().min(1).max(4000),
  category: ShortcutCategorySchema,
});

const UpdateShortcutSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  category: ShortcutCategorySchema.optional(),
});

const DeleteShortcutSchema = z.object({
  id: z.string().uuid(),
});

type ShortcutRow = {
  id: string;
  user_id: string;
  label: string;
  prompt: string;
  category: string;
  created_at: string;
  updated_at: string;
};

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<ShortcutRow>(
    `select id, user_id, label, prompt, category, created_at, updated_at
     from user_shortcuts
     where user_id = $1
     order by created_at desc`,
    [userId],
  );

  return NextResponse.json({ shortcuts: rows });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();

  // Support both create (no id) and update (with id) in a single POST
  if (body && typeof body === 'object' && 'id' in body) {
    const parsed = UpdateShortcutSchema.safeParse(body);
    if (!parsed.success) throw createError.validation('Invalid request body');

    const { id, label, prompt, category } = parsed.data;

    const setClauses: string[] = ['updated_at = now()'];
    const params: unknown[] = [id, userId];
    let paramIdx = 3;

    if (label !== undefined) {
      setClauses.push(`label = $${paramIdx++}`);
      params.push(label);
    }
    if (prompt !== undefined) {
      setClauses.push(`prompt = $${paramIdx++}`);
      params.push(prompt);
    }
    if (category !== undefined) {
      setClauses.push(`category = $${paramIdx++}`);
      params.push(category);
    }

    const [updated] = await db.query<ShortcutRow>(
      `update user_shortcuts set ${setClauses.join(', ')}
       where id = $1 and user_id = $2
       returning id, user_id, label, prompt, category, created_at, updated_at`,
      params,
    );

    if (!updated) throw createError.notFound('Shortcut not found');

    return NextResponse.json({ shortcut: updated });
  }

  // Create new shortcut
  const parsed = CreateShortcutSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { label, prompt, category } = parsed.data;

  const [row] = await db.query<ShortcutRow>(
    `insert into user_shortcuts (user_id, label, prompt, category, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     returning id, user_id, label, prompt, category, created_at, updated_at`,
    [userId, label, prompt, category],
  );

  return NextResponse.json({ shortcut: row }, { status: 201 });
}

async function handleDelete(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = DeleteShortcutSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { id } = parsed.data;

  const affected = await db.execute('delete from user_shortcuts where id = $1 and user_id = $2', [
    id,
    userId,
  ]);

  if (affected === 0) {
    throw createError.notFound('Shortcut not found');
  }

  return NextResponse.json({ deleted: true });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);
