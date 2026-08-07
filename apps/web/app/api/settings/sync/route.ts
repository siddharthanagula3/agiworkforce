/**
 * Cross-device cloud SETTINGS sync — single-document delta (mirrors the sync family).
 * Design: docs/plans/shared-cloud-state-2026-06-22.md
 *
 *   GET  /api/settings/sync?since=<server_version cursor>
 *        → the user's CLOUD-SAFE settings subset IF its row server_version > cursor,
 *          plus the cursor. Otherwise an empty doc (nothing new).
 *   POST /api/settings/sync  { settings: {<namespace>: {...}}, baseVersion }
 *        → merges ONLY when baseVersion matches the server-owned revision.
 *          user_id is server-side; RLS WITH CHECK is the backstop.
 *
 * TRUST BOUNDARY — THE WHOLE POINT OF THIS FILE:
 * `user_settings.settings` is one JSONB doc keyed by namespace and it can hold
 * SECRETS (BYOK / provider API keys, local model paths, device/push config,
 * providerMode). A wholesale settings sync would LEAK credentials across devices /
 * the trust boundary. So sync is enforced SERVER-SIDE through a **fail-closed
 * namespace ALLOWLIST** (an allowlist, not a denylist: an incomplete list merely
 * under-syncs a preference — it can never leak a secret) PLUS a recursive secret-key
 * scrubber as defense-in-depth. Enforcement is on the server, never trusting the
 * client. Both PULL (don't emit secret namespaces) and PUSH (don't store via sync)
 * are filtered.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServerVersionSchema, SettingsSyncPushRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

/**
 * Cloud-safe settings namespaces — device-agnostic UI/personalization prefs that are
 * safe to share across a single account's devices. FAIL-CLOSED: any namespace NOT in
 * this set (incl. unknown/new ones) is never pulled or pushed. Expand only with a
 * namespace proven to contain no secrets/device-specific values. NEVER add: byok,
 * apiKeys, providers, models (local paths), device, security, credentials, account.
 */
export const CLOUD_SAFE_SETTINGS_NAMESPACES: readonly string[] = [
  'appearance',
  'personalization',
  'profile',
  // PER-9: `general` is the namespace Settings → General ACTUALLY writes
  // (display/preferred name, work description, custom instructions, chat font).
  // It was missing here, so `filterCloudSafeSettings` silently dropped
  // it in BOTH directions while the UI said "Synced to your account". Nothing
  // in it is a secret or device-specific: it is the profile identity every
  // surface reads via `lib/server/user-identity.ts`. The fail-closed design was
  // right; the list just did not match the writer.
  'general',
  'notifications',
  'language',
  'accessibility',
  // Account memory policy contains booleans only and must remain identical on
  // Web and Desktop Managed Cloud. It carries no device path or credential.
  'capabilities',
  'chat',
  'editor',
];

/** Namespaces that must NEVER sync — asserted in tests as a tripwire on the allowlist. */
export const FORBIDDEN_SETTINGS_NAMESPACES: readonly string[] = [
  'byok',
  'apiKeys',
  'api_keys',
  'providers',
  'models',
  'device',
  'security',
  'secrets',
  'credentials',
  'account',
];

/** Key substrings that signal a secret; scrubbed even inside an allowed namespace. */
const SECRET_KEY_PATTERN =
  /(api[-_]?key|secret|token|password|passwd|credential|bearer|authorization|private[-_]?key|access[-_]?key|client[-_]?secret)/i;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Recursively drop any object key that looks like a secret. Defense-in-depth on top
 * of the namespace allowlist: even a "safe" namespace can't carry a stray token.
 */
export function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k) || UNSAFE_OBJECT_KEYS.has(k)) continue;
      out[k] = scrubSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * Project a namespace-keyed settings doc down to the cloud-safe allowlist, then scrub
 * secret-looking keys from the survivors. The only function that decides what crosses
 * the device boundary. Exported for direct unit testing.
 */
export function filterCloudSafeSettings(
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!settings || typeof settings !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const ns of CLOUD_SAFE_SETTINGS_NAMESPACES) {
    if (Object.prototype.hasOwnProperty.call(settings, ns)) {
      out[ns] = scrubSecrets(settings[ns]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid settings sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const [row] = await db.query<{
      settings: Record<string, unknown> | null;
      server_version: string;
    }>(`select settings, server_version from user_settings where user_id = $1 limit 1`, [userId]);
    if (!row || !bigintGreater(row.server_version, since)) {
      return NextResponse.json({ settings: {}, cursor: since, hasMore: false });
    }
    return NextResponse.json({
      settings: filterCloudSafeSettings(row.settings),
      cursor: row.server_version,
      hasMore: false,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Settings sync pull failed');
    throw createError.internal('Failed to pull settings changes');
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function handlePost(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }
  const parsed = SettingsSyncPushRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid settings sync payload', parsed.error);
  }

  // SERVER-SIDE enforcement: only cloud-safe namespaces, scrubbed, ever get stored
  // through sync. A client cannot push a secret namespace into the synced surface.
  const safeIncoming = filterCloudSafeSettings(parsed.data.settings);

  try {
    // Compare-and-swap on the server-owned revision. Client clocks never
    // participate in conflict resolution. Existing non-synced namespaces and
    // sibling keys inside an allowed namespace remain intact.
    const rows = await db.query<{ server_version: string }>(
      `
        with updated as (
          update user_settings
             set settings = coalesce(user_settings.settings, '{}'::jsonb) || (
                   select coalesce(
                     jsonb_object_agg(
                       incoming.key,
                       case
                         when jsonb_typeof(
                                coalesce(user_settings.settings, '{}'::jsonb) -> incoming.key
                              ) = 'object'
                          and jsonb_typeof(incoming.value) = 'object'
                         then (coalesce(user_settings.settings, '{}'::jsonb) -> incoming.key)
                              || incoming.value
                         else incoming.value
                       end
                     ),
                     '{}'::jsonb
                   )
                     from jsonb_each($2::jsonb) as incoming(key, value)
                 ),
                 updated_at = now()
           where user_id = $1
             and user_settings.server_version = $3::bigint
          returning server_version
        ), inserted as (
          insert into user_settings (user_id, settings, updated_at)
          select $1, $2::jsonb, now()
           where $3::bigint = 0
          on conflict (user_id) do nothing
          returning server_version
        )
        select server_version from updated
        union all
        select server_version from inserted
        limit 1
      `,
      [userId, JSON.stringify(safeIncoming), parsed.data.baseVersion],
    );

    if (rows[0]) {
      return NextResponse.json({ applied: true, cursor: rows[0].server_version });
    }
    // Revision conflict: return the current revision, but the client must retain
    // its pre-push cursor and pull the server winner before attempting another push.
    const [current] = await db.query<{ server_version: string }>(
      `select server_version from user_settings where user_id = $1 limit 1`,
      [userId],
    );
    return NextResponse.json({ applied: false, cursor: current?.server_version ?? '0' });
  } catch (error) {
    logger.error({ error, userId }, 'Settings sync push failed');
    throw createError.internal('Failed to push settings changes');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compare two non-negative integer strings without precision loss. */
function bigintGreater(a: string, b: string): boolean {
  const na = (a ?? '0').replace(/^0+/, '') || '0';
  const nb = (b ?? '0').replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
