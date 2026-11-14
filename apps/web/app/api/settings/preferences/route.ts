import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  resolveActiveOrganizationId,
  touchesActiveOrganizationNamespace,
} from '@/lib/services/active-workspace-service';
import { organizationMemoryGate } from '@/lib/services/managed-memory-context-service';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import { hasInvalidModelImprovementConsent } from '@/lib/server/model-improvement-consent';
import { SKILL_SETTINGS_NAMESPACE } from '@/lib/services/skill-install-service';
import { serializeUserSettings } from '@/lib/services/user-settings-payload';
import { autonomousToolApprovalsAvailable } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import { TOOL_APPROVAL_PREFERENCE_NAMESPACE } from '@shared/types/toolApprovalPolicy';

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

type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
type SettingsWriteResult =
  | { kind: 'saved'; row: UserSettingsRow | undefined; delta: Record<string, unknown> }
  | { kind: 'conflict'; current: StoredSettings };

function namespaceObject(settings: Record<string, unknown>, namespace: string) {
  const value = settings[namespace];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const CAPABILITIES_NAMESPACE = 'capabilities';
const SERVICE_OWNED_NAMESPACES: readonly string[] = [SKILL_SETTINGS_NAMESPACE];

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

async function readSettings(db: ScopedDb, userId: string): Promise<StoredSettings> {
  const [row] = await db.query<UserSettingsRow>(
    'select settings, updated_at::text as version from public.user_settings where user_id = $1 limit 1',
    [userId],
  );
  return { settings: row?.settings ?? {}, version: row?.version ?? null };
}

async function readLockedSettings(db: ScopedDb, userId: string): Promise<StoredSettings | null> {
  const [row] = await db.query<UserSettingsRow>(
    'select settings, updated_at::text as version from public.user_settings where user_id = $1 for update',
    [userId],
  );
  return row ? { settings: row.settings ?? {}, version: row.version ?? null } : null;
}

function validatedSettingsDelta(current: Record<string, unknown>, parsed: SettingsPatch) {
  const delta: Record<string, unknown> = parsed.namespace
    ? {
        [parsed.namespace]: parsed.patch
          ? { ...namespaceObject(current, parsed.namespace), ...parsed.patch }
          : (parsed.value ?? parsed.settings ?? {}),
      }
    : (parsed.settings ?? {});
  if (hasInvalidModelImprovementConsent(delta)) {
    throw createError.validation('Model improvement choices must be on or off');
  }
  serializeUserSettings({ ...current, ...delta });
  return delta;
}

async function writeSettings(
  db: ScopedDb,
  userId: string,
  parsed: SettingsPatch,
): Promise<SettingsWriteResult> {
  return db.transaction(async (tx): Promise<SettingsWriteResult> => {
    let current = await readLockedSettings(tx, userId);
    if (!current) {
      const delta = validatedSettingsDelta({}, parsed);
      const [row] = await tx.query<UserSettingsRow>(
        `insert into public.user_settings (user_id, settings, updated_at)
         values ($1, $2::jsonb, timezone('utc'::text, now()))
         on conflict (user_id) do nothing
         returning settings, updated_at::text as version`,
        [userId, JSON.stringify(delta)],
      );
      if (row) return { kind: 'saved', row, delta };
      current = await readLockedSettings(tx, userId);
      if (!current) throw createError.internal('Settings row could not be locked');
    }

    const delta = validatedSettingsDelta(current.settings, parsed);
    const expectedVersion = parsed.expectedVersion ?? null;
    if (expectedVersion !== null && current.version !== expectedVersion) {
      return { kind: 'conflict', current };
    }
    const [row] = await tx.query<UserSettingsRow>(
      `update public.user_settings
       set settings = user_settings.settings || $2::jsonb,
           updated_at = timezone('utc'::text, now())
       where user_id = $1
       returning settings, updated_at::text as version`,
      [userId, JSON.stringify(delta)],
    );
    return { kind: 'saved', row, delta };
  });
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const namespace = new URL(request.url).searchParams.get('namespace');
  const stored = await readSettings(db, userId);

  const organizationMemoryAllowed =
    !namespace || namespace === CAPABILITIES_NAMESPACE
      ? await organizationMemoryGate(db, await resolveActiveOrganizationId(db, userId, request))
      : undefined;

  // Whether the account may choose "Skip approvals" is the workspace's answer,
  // not the client's: the settings pane has to render a control it is allowed
  // to offer rather than one the tool gate would silently overrule.
  const autonomousToolApprovalsAllowed =
    !namespace || namespace === TOOL_APPROVAL_PREFERENCE_NAMESPACE
      ? await autonomousToolApprovalsAvailable(db, userId)
      : undefined;

  if (namespace) {
    return NextResponse.json({
      settings: stored.settings[namespace] ?? {},
      version: stored.version,
      ...(organizationMemoryAllowed === undefined ? {} : { organizationMemoryAllowed }),
      ...(autonomousToolApprovalsAllowed === undefined ? {} : { autonomousToolApprovalsAllowed }),
    });
  }

  return NextResponse.json({
    settings: stored.settings,
    version: stored.version,
    organizationMemoryAllowed,
    autonomousToolApprovalsAllowed,
  });
}

async function handlePut(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  let parsed: SettingsPatch;
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

  const targetNamespaces = parsed.namespace
    ? [parsed.namespace]
    : Object.keys(parsed.settings ?? {});
  const serviceOwned = targetNamespaces.find((namespace) =>
    SERVICE_OWNED_NAMESPACES.includes(namespace),
  );
  if (serviceOwned) {
    throw createError.validation(
      `The ${serviceOwned} settings change only through their own endpoint, not preferences.`,
    );
  }

  let result: SettingsWriteResult;
  try {
    result = await writeSettings(db, userId, parsed);
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId }, 'Failed to persist user settings');
    throw createError.internal('Failed to save settings');
  }

  if (result.kind === 'conflict') return settingsVersionConflict(result.current, parsed);
  if (touchesActiveOrganizationNamespace(result.delta)) {
    await invalidateActiveOrganizationCache(userId);
  }

  const row = result.row;
  if (
    !row?.settings ||
    typeof row.settings !== 'object' ||
    Array.isArray(row.settings) ||
    typeof row.version !== 'string' ||
    !row.version.trim()
  ) {
    throw createError.internal('Settings write was not confirmed');
  }
  return NextResponse.json({ settings: row.settings, version: row.version });
}

function settingsVersionConflict(latest: StoredSettings, parsed: SettingsPatch): NextResponse {
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
