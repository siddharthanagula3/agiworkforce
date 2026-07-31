import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow } from '@/lib/server/neon-types';
import {
  backfillDisplayNameFromUpstream,
  readUserIdentity,
  resolveVisibleName,
} from '@/lib/server/user-identity';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { effectivePlanTier } from '@/lib/entitlement';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  canAccessManualModelSelection,
  SYNCED_APP_SURFACES,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import type { MeResponse, MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import {
  buildMeCapabilityHandshake,
  toWireCapabilityHandshake,
} from '@/lib/services/capability-handshake-service';

const PatchMeSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

function resolveSubscriptionSource(
  subscription:
    | {
        stripe_subscription_id?: string | null;
        apple_original_transaction_id?: string | null;
        google_purchase_token?: string | null;
      }
    | null
    | undefined,
): MeSubscriptionSource {
  if (!subscription) return 'none';
  if (subscription.stripe_subscription_id) return 'stripe';
  if (subscription.apple_original_transaction_id) return 'apple';
  if (subscription.google_purchase_token) return 'google';
  return 'manual';
}

async function handleGetMe(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Auth: supports both Clerk session (cookie) and Bearer token paths.
    const { userId, email } = await getClerkAuthUser(request);

    // Resolve the real display name + email from the Clerk profile. The session
    // claims only carry userId (and sometimes email), so without this lookup the
    // name falls back to the email prefix or 'User'. clerkClient works in both
    // dev and production Clerk instances.
    let clerkName: string | undefined;
    let resolvedEmail = email ?? undefined;
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      // Cap the Clerk profile lookup: it is a network round-trip and the header
      // greeting is gated on the resolved name, so a slow Clerk must never stall
      // /api/me.
      //
      // PER-31: a timeout used to become a SESSION-LONG wrong name, because the
      // comment's promised "later load" never happened (PER-1). Two things fix
      // that now: the client re-resolves when the Clerk session cookie changes
      // or the tab regains focus, and any name we do resolve here is written
      // back to `profiles.display_name` below — so the next read does not
      // depend on Clerk at all.
      let nameTimer: ReturnType<typeof setTimeout> | undefined;
      const clerkUser = await Promise.race([
        client.users.getUser(userId).finally(() => {
          if (nameTimer) clearTimeout(nameTimer);
        }),
        new Promise<never>((_, reject) => {
          nameTimer = setTimeout(() => reject(new Error('clerk getUser timeout')), 1500);
        }),
      ]);
      clerkName =
        clerkUser.fullName?.trim() ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
        clerkUser.firstName?.trim() ||
        clerkUser.username?.trim() ||
        undefined;
      resolvedEmail = resolvedEmail ?? clerkUser.primaryEmailAddress?.emailAddress ?? undefined;
    } catch (clerkLookupError) {
      logger.warn({ userId, error: clerkLookupError }, 'Failed to resolve Clerk profile name');
    }

    // PER-8: one resolver owns the profile identity (full name, preferred
    // name, work description). Readers never re-derive it from Clerk metadata
    // or a settings namespace on their own.
    const [subscription, identity] = await Promise.all([
      SubscriptionService.getSubscription(userId),
      readUserIdentity(userId),
    ]);
    const profile = identity.profile;

    // PER-31: cache an upstream-resolved name so a future Clerk slowdown is
    // harmless. Only fills a name we have never been told; never overwrites one
    // the user chose in Settings.
    if (!identity.displayName && clerkName) {
      await backfillDisplayNameFromUpstream(userId, clerkName);
    }

    const rawRoutingPreferences = profile?.routing_preferences;
    const routing_preferences =
      rawRoutingPreferences &&
      typeof rawRoutingPreferences === 'object' &&
      !Array.isArray(rawRoutingPreferences)
        ? (rawRoutingPreferences as { us_only?: boolean; geo_overlay?: string })
        : {};

    // Entitlement is a function of subscription STATUS, not raw plan_tier: a
    // canceled/unpaid row can still carry a paid plan_tier (the tier is re-derived
    // from the Stripe price on every webhook update), so unlocking capabilities off
    // the raw tier would show paid features (model picker, AGI Work) as available to
    // a user the server will refuse — a dead/false control. Gate features on the
    // effective tier; keep the `plan` object below on the raw tier + real status so
    // billing UI can honestly show "Pro — canceled".
    const effectiveTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);

    const feature_flags = {
      advanced_model_access: canAccessManualModelSelection(effectiveTier),
      // Deployment capability, not a user entitlement: whether this deployment
      // has the reachable E2B execution loop enabled (AGI_E2B_EXECUTION=1).
      // The composer gates the "Run code" toggle on this so it is never a
      // cosmetic dead control when the server would ignore code_execution.
      code_execution: e2bCutoverEnabled(),
      // Safe deployment capability only; never exposes the Perplexity key.
      // Native provider search remains available independently.
      generic_web_search: webSearchBackendConfigured(),
    };

    // Optional `?surface=` lets a non-web caller (desktop, mobile — both
    // already validate against this same MeResponseSchema) identify itself
    // for the surface capability layer below. No existing caller sends this
    // today, so every request keeps resolving to 'web' exactly as before —
    // additive, not a behavior change for current clients.
    const requestedSurface = new URL(request.url).searchParams.get('surface');
    const surface: SyncedAppSurface = (SYNCED_APP_SURFACES as readonly string[]).includes(
      requestedSurface ?? '',
    )
      ? (requestedSurface as SyncedAppSurface)
      : 'web';

    // First real consumer of the capability-handshake contract
    // (`@agiworkforce/types` `capability-handshake/`, W5 discipline wave 1) —
    // see `lib/services/capability-handshake-service.ts` for how each of the
    // four policy layers is sourced from real, already-resolved data.
    const capability_handshake = buildMeCapabilityHandshake({
      userId,
      // Effective (status-gated) tier so a canceled/unpaid row does not unlock
      // paid capabilities. See effectiveTier note above.
      tier: effectiveTier,
      surface,
      cloudExecutionDeploymentEnabled: feature_flags.code_execution,
    });

    const plan = {
      tier: subscription?.plan_tier || 'free',
      display_name:
        (subscription?.plan_tier || 'free').charAt(0).toUpperCase() +
        (subscription?.plan_tier || 'free').slice(1),
      status: subscription?.status || 'none',
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime() / 1000
        : null,
      subscription_source: resolveSubscriptionSource(subscription),
    };

    // Typed against the shared /api/me contract (packages/services
    // cloud-contracts) — the contract test in __tests__/route.contract.test.ts
    // asserts the runtime output parses against the same schema.
    const responseBody: MeResponse = {
      id: userId,
      email: resolvedEmail ?? null,
      name: resolveVisibleName(identity, clerkName, resolvedEmail),
      profile: {
        // The name the user actually set, or the upstream one we just cached.
        display_name: identity.displayName ?? clerkName ?? null,
        preferred_name: identity.preferredName,
        work_description: identity.workDescription,
      },
      avatar_url: profile?.avatar_url ?? null,
      created_at: null,
      updated_at: Date.now() / 1000,
      plan,
      feature_flags,
      routing_preferences,
      capability_handshake: toWireCapabilityHandshake(capability_handshake),
    };
    return NextResponse.json(responseBody);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in /api/me',
    );
    throw error;
  }
}

/**
 * PATCH /api/me
 * Update the current user's profile (display_name, avatar_url).
 * Only columns that exist in public.profiles are persisted here.
 * Extended profile fields (bio, phone, timezone, language) are stored
 * via PUT /api/settings/preferences under the "profile" namespace.
 */
async function handlePatchMe(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const body = await request.json().catch(() => ({}));
  const parsed = PatchMeSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    throw createError.validation('At least one field is required');
  }

  const db = getNeonDb();

  // Build both INSERT columns and UPDATE SET clauses together so a first-write
  // (no existing profile row) also persists the requested field values.
  const insertCols: string[] = ['id', 'updated_at'];
  const insertVals: string[] = ['$1', 'now()'];
  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [userId];

  if (updates.display_name !== undefined) {
    params.push(updates.display_name);
    const idx = params.length;
    insertCols.push('display_name');
    insertVals.push(`$${idx}`);
    setClauses.push(`display_name = $${idx}`);
  }
  if (updates.avatar_url !== undefined) {
    params.push(updates.avatar_url);
    const idx = params.length;
    insertCols.push('avatar_url');
    insertVals.push(`$${idx}`);
    setClauses.push(`avatar_url = $${idx}`);
  }

  await db.execute(
    `insert into public.profiles (${insertCols.join(', ')})
     values (${insertVals.join(', ')})
     on conflict (id)
     do update set ${setClauses.join(', ')}`,
    params,
  );

  logger.info({ userId }, 'Profile updated via PATCH /api/me');

  const [row] = await db.query<ProfileRow>(
    'select id, email, display_name, avatar_url from public.profiles where id = $1 limit 1',
    [userId],
  );

  return NextResponse.json({
    id: userId,
    display_name: row?.display_name ?? null,
    avatar_url: row?.avatar_url ?? null,
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGetMe));
export const PATCH = withCorsRoute(withErrorHandler(handlePatchMe));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
