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
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
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
import type { MeResponse } from '@agiworkforce/cloud-contracts';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import {
  buildMeCapabilityHandshake,
  toWireCapabilityHandshake,
} from '@/lib/services/capability-handshake-service';
import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';
import { getCapabilityLimitResets } from '@/lib/server/capability-limit-resets';

const PatchMeSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

async function handleGetMe(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { userId, email } = await getClerkAuthUser(request);

    let clerkName: string | undefined;
    let resolvedEmail = email ?? undefined;
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
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

    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
    const [subscription, identity] = await Promise.all([
      SubscriptionService.getSubscription(db, userId),
      readUserIdentity(db, userId),
    ]);
    const profile = identity.profile;

    if (!identity.displayName && clerkName) {
      await backfillDisplayNameFromUpstream(db, userId, clerkName);
    }

    const rawRoutingPreferences = profile?.routing_preferences;
    const routing_preferences =
      rawRoutingPreferences &&
      typeof rawRoutingPreferences === 'object' &&
      !Array.isArray(rawRoutingPreferences)
        ? (rawRoutingPreferences as { us_only?: boolean; geo_overlay?: string })
        : {};

    const effectiveTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);

    const feature_flags = {
      advanced_model_access: canAccessManualModelSelection(effectiveTier),
      code_execution: e2bCutoverEnabled(),
      generic_web_search: webSearchBackendConfigured(),
    };

    const requestedSurface = new URL(request.url).searchParams.get('surface');
    const surface: SyncedAppSurface = (SYNCED_APP_SURFACES as readonly string[]).includes(
      requestedSurface ?? '',
    )
      ? (requestedSurface as SyncedAppSurface)
      : 'web';

    const capability_handshake = buildMeCapabilityHandshake({
      userId,
      tier: effectiveTier,
      surface,
      cloudExecutionDeploymentEnabled: feature_flags.code_execution,
      resets: await getCapabilityLimitResets(db, userId, subscription?.current_period_end ?? null),
    });

    const subscriptionSource = resolveSubscriptionBillingSource(subscription);
    const plan = {
      tier: subscription?.plan_tier || 'free',
      display_name:
        (subscription?.plan_tier || 'free').charAt(0).toUpperCase() +
        (subscription?.plan_tier || 'free').slice(1),
      status: subscription?.status || 'none',
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime() / 1000
        : null,
      cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
      ...(subscriptionSource === 'unverified' ? {} : { subscription_source: subscriptionSource }),
    };

    const responseBody: MeResponse = {
      id: userId,
      email: resolvedEmail ?? null,
      name: resolveVisibleName(identity, clerkName, resolvedEmail),
      profile: {
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

  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });

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
