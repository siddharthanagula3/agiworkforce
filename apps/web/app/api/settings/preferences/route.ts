import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  resolveActiveOrganizationId,
  touchesActiveOrganizationNamespace,
} from '@/lib/services/active-workspace-service';
import { organizationMemoryGate } from '@/lib/services/managed-memory-context-service';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';

const SettingsPatchSchema = z.object({
  namespace: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,48}$/)
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  value: z.unknown().optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
  expectedVersion: z.string().nullable().optional(),
});

type UserSettingsRow = {
  settings: Record<string, unknown> | null;
  version?: string | null;
};

interface StoredSettings {
  settings: Record<string, unknown>;
  version: string | null;
}

function namespaceObject(settings: Record<string, unknown>, namespace: string) {
  const value = settings[namespace];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const CAPABILITIES_NAMESPACE = 'capabilities';

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

async function readSettings(db: ScopedDb, userId: string): Promise<StoredSettings> {
  try {
    const [row] = await db.query<UserSettingsRow>(
      'select settings, updated_at::text as version from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
    return { settings: row?.settings ?? {}, version: row?.version ?? null };
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
  const stored = await readSettings(db, userId);

  if (namespace) {
    const organizationMemoryAllowed =
      namespace === CAPABILITIES_NAMESPACE
        ? await organizationMemoryGate(db, await resolveActiveOrganizationId(db, userId, request))
        : undefined;

    return NextResponse.json({
      settings: stored.settings[namespace] ?? {},
      version: stored.version,
      ...(organizationMemoryAllowed === undefined ? {} : { organizationMemoryAllowed }),
    });
  }

  return NextResponse.json({ settings: stored.settings, version: stored.version });
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
  if (parsed.patch && !parsed.namespace) {
    throw createError.validation('patch requires a namespace');
  }

  const current = await readSettings(db, userId);
  const expectedVersion = parsed.expectedVersion ?? null;

  const delta: Record<string, unknown> = parsed.namespace
    ? {
        [parsed.namespace]: parsed.patch
          ? { ...namespaceObject(current.settings, parsed.namespace), ...parsed.patch }
          : (parsed.value ?? parsed.settings ?? {}),
      }
    : (parsed.settings ?? {});

  const estimated = { ...current.settings, ...delta };
  if (JSON.stringify(estimated).length > 100_000) {
    throw createError.validation('Settings payload is too large');
  }

  let merged: Record<string, unknown> = estimated;
  let version: string | null = current.version;
  try {
    const [row] = await db.query<UserSettingsRow>(
      `insert into public.user_settings (user_id, settings, updated_at)
       values ($1, $2::jsonb, timezone('utc'::text, now()))
       on conflict (user_id)
       do update set settings = user_settings.settings || excluded.settings,
                     updated_at = excluded.updated_at
       where $3::text is null or user_settings.updated_at::text = $3::text
       returning settings, updated_at::text as version`,
      [userId, JSON.stringify(delta), expectedVersion],
    );
    if (!row && expectedVersion !== null) return settingsVersionConflict(db, userId, parsed);
    if (row?.settings) merged = row.settings;
    version = row?.version ?? version;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to persist user settings');
    throw createError.internal('Failed to save settings');
  }

  if (touchesActiveOrganizationNamespace(delta)) {
    await invalidateActiveOrganizationCache(userId);
  }

  return NextResponse.json({ settings: merged, version });
}

async function settingsVersionConflict(
  db: ScopedDb,
  userId: string,
  parsed: z.infer<typeof SettingsPatchSchema>,
): Promise<NextResponse> {
  const latest = await readSettings(db, userId);
  return NextResponse.json(
    {
      error: {
        code: 'SETTINGS_VERSION_CONFLICT',
        message: 'These settings changed elsewhere. Nothing was saved; reload and choose again.',
      },
      settings: parsed.namespace ? (latest.settings[parsed.namespace] ?? {}) : latest.settings,
      version: latest.version,
    },
    { status: 412 },
  );
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
