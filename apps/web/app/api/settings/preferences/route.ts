import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

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

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

async function readSettings(db: ScopedDb, userId: string): Promise<Record<string, unknown>> {
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

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const namespace = new URL(request.url).searchParams.get('namespace');
  const settings = await readSettings(db, userId);

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

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  let parsed: z.infer<typeof SettingsPatchSchema>;
  try {
    parsed = SettingsPatchSchema.parse(await request.json());
  } catch {
    throw createError.validation('Invalid settings payload');
  }

  if (!parsed.namespace && !parsed.settings) {
    throw createError.validation('namespace or settings is required');
  }

  const delta: Record<string, unknown> = parsed.namespace
    ? { [parsed.namespace]: parsed.value ?? parsed.settings ?? {} }
    : (parsed.settings ?? {});

  const current = await readSettings(db, userId);
  const estimated = { ...current, ...delta };
  if (JSON.stringify(estimated).length > 100_000) {
    throw createError.validation('Settings payload is too large');
  }

  let merged: Record<string, unknown> = estimated;
  try {
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
