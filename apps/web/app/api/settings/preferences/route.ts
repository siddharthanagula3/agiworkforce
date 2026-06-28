import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

const SettingsPatchSchema = z.object({
  namespace: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,48}$/)
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  value: z.unknown().optional(),
});

type UserSettingsRow = {
  settings: Record<string, unknown> | null;
};

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

async function readSettings(userId: string): Promise<Record<string, unknown>> {
  const db = getNeonDb();
  try {
    const [row] = await db.query<UserSettingsRow>(
      'select settings from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
    return row?.settings ?? {};
  } catch (error) {
    if (isUndefinedTable(error)) {
      logger.error({ error, userId }, 'user_settings table is missing; run migrations');
      throw createError.internal('Settings storage is not migrated');
    }
    throw error;
  }
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const namespace = new URL(request.url).searchParams.get('namespace');
  const settings = await readSettings(userId);

  if (namespace) {
    return NextResponse.json({ settings: settings[namespace] ?? {} });
  }

  return NextResponse.json({ settings });
}

async function handlePut(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  let parsed: z.infer<typeof SettingsPatchSchema>;
  try {
    parsed = SettingsPatchSchema.parse(await request.json());
  } catch {
    throw createError.validation('Invalid settings payload');
  }

  if (!parsed.namespace && !parsed.settings) {
    throw createError.validation('namespace or settings is required');
  }

  // Persist ONLY the changed namespace/keys (the delta), never the whole
  // read-merged document. Writing the full merged doc made this a non-atomic
  // read-modify-write: two concurrent PUTs both read the same old doc and the
  // second writer's stale copy silently clobbered the first writer's namespace
  // (lost update). Sending the delta and merging in SQL with `||` makes the
  // write a single atomic statement, so a concurrent edit to a DIFFERENT
  // namespace is preserved.
  const delta: Record<string, unknown> = parsed.namespace
    ? { [parsed.namespace]: parsed.value ?? parsed.settings ?? {} }
    : (parsed.settings ?? {});

  // Advisory size guard only: estimate the resulting doc from the last read
  // merged with the delta. This read is no longer on the write's correctness
  // path (the SQL `||` merge is authoritative); it just bounds runaway growth.
  const current = await readSettings(userId);
  const estimated = { ...current, ...delta };
  if (JSON.stringify(estimated).length > 100_000) {
    throw createError.validation('Settings payload is too large');
  }

  const db = getNeonDb();
  let merged: Record<string, unknown> = estimated;
  try {
    // `user_settings.settings || excluded.settings` is a top-level (shallow)
    // jsonb merge that preserves every namespace not present in the delta —
    // matching the sibling /api/settings/sync route. RETURNING gives us the
    // true post-merge doc (which may include a concurrent writer's namespace).
    const [row] = await db.query<UserSettingsRow>(
      `insert into public.user_settings (user_id, settings, updated_at)
       values ($1, $2::jsonb, timezone('utc'::text, now()))
       on conflict (user_id)
       do update set settings = user_settings.settings || excluded.settings,
                     updated_at = excluded.updated_at
       returning settings`,
      [userId, JSON.stringify(delta)],
    );
    if (row?.settings) merged = row.settings;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to persist user settings');
    throw createError.internal('Failed to save settings');
  }

  return NextResponse.json({ settings: merged });
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
