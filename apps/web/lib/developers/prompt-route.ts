import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';

export type PromptRouteParams = Promise<Record<string, string>>;

const IdSchema = z.string().uuid();

export async function readRouteId(
  params: PromptRouteParams,
  key: string,
  notFound: string,
): Promise<string> {
  const parsed = IdSchema.safeParse((await params)[key]);
  if (!parsed.success) throw createError.notFound(notFound);
  return parsed.data;
}

export async function openPromptRead(
  request: NextRequest,
): Promise<{ limited: NextResponse } | { scope: UserScopedDb }> {
  const limited = await withRateLimit(request, 'developer-console');
  if (limited) return { limited };
  return { scope: await getUserScopedDb(request) };
}

export async function openPromptWrite(
  request: NextRequest,
): Promise<{ limited: NextResponse } | { scope: UserScopedDb }> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return { limited: csrfError as NextResponse };
  return openPromptRead(request);
}

export async function readPromptBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw createError.validation('Invalid request', parsed.error.issues);
  return parsed.data;
}
