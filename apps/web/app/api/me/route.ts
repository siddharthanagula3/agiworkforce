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
  backfillProfileFromUpstream,
  readUserIdentity,
  resolveVisibleName,
} from '@/lib/server/user-identity';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  canAccessManualModelSelection,
  getBillingPlanPricing,
  SYNCED_APP_SURFACES,
  type PlatformCapability,
  type SyncedAppSurface,
  type WorkspaceFeature,
  seatTypeField,
  wirePlanOf,
} from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  MeDisabledFeature,
  MeResponse,
  MeWorkspaceDataRegion,
} from '@agiworkforce/cloud-contracts';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import {
  buildMeCapabilityHandshake,
  toWireCapabilityHandshake,
} from '@/lib/services/capability-handshake-service';
import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';
import { getCapabilityLimitResets } from '@/lib/server/capability-limit-resets';
import { resolveCloudCodeExecutionPolicy } from '@/lib/server/code-execution-policy';
import { getIdentityUser } from '@/lib/server/identity';
import { provisionEnterpriseSignIn } from '@/lib/server/sso/jit-provisioning';
import { linkPendingScimUsersAtSignIn } from '@/lib/server/scim/scim-sign-in-linking';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { readOrganizationRegion } from '@/lib/server/data-region';
import { DATA_REGIONS } from '@agiworkforce/compliance';
import { resolveEffectiveWorkspaceControls } from '@/lib/services/organization-policy-gate';
import { attributeReferralFromRequest } from '@/lib/services/referral-attribution';
import {
  buildFlagSubject,
  evaluateFlagsForSubject,
} from '@/lib/feature-flags/flag-evaluation-service';
import { clientVisibleFlags } from '@/lib/feature-flags/routing-flags';
import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import { getActiveFlagDefinitions } from '@/lib/feature-flags/flag-store';
import { versionDisableReason } from '@/lib/feature-flags/version-disable';
import {
  platformCapabilitiesOf,
  type KillSwitchCapability,
} from '@/lib/feature-flags/kill-switches';
import { readRolloutGate } from '@/lib/feature-flags/rollout-gate';
import {
  RELEASE_CHANNELS,
  rolloutRingKey,
  type ReleaseChannel,
} from '@/lib/feature-flags/rollout-rings';

const IDENTITY_LOOKUP_TIMEOUT_MS = 1500;

/**
 * The switches holding something closed right now, each with the sentence the
 * operator left on it. The handshake can only name the platform subset, so
 * without this a client told `work` is off has nowhere to read why.
 */
async function closedFeatures(
  closed: readonly KillSwitchCapability[],
): Promise<MeDisabledFeature[]> {
  if (closed.length === 0) return [];
  const definitions = await getActiveFlagDefinitions();
  return closed.map((capability) => ({
    capability,
    reason: versionDisableReason(definitions, capability),
  }));
}

const WORKSPACE_FEATURE_CAPABILITIES: ReadonlyArray<
  readonly [WorkspaceFeature, PlatformCapability]
> = [
  ['research', 'canUseDeepResearch'],
  ['work', 'canUseAgiWork'],
  ['skills', 'canUseSkills'],
  ['plugins', 'canUsePlugins'],
];

async function workspaceCapabilityDecisions(
  userId: string,
  request: NextRequest,
): Promise<{ disabled: PlatformCapability[]; unreadable: PlatformCapability[] }> {
  try {
    const effective = await resolveEffectiveWorkspaceControls(getNeonDb(), userId, request);
    const featureAccess = effective?.controls.featureAccess;
    return {
      disabled: featureAccess
        ? WORKSPACE_FEATURE_CAPABILITIES.filter(
            ([feature]) => featureAccess[feature] === false,
          ).map(([, capability]) => capability)
        : [],
      unreadable: [],
    };
  } catch (error) {
    logger.error({ userId, error }, 'Workspace controls unreadable; their capabilities are closed');
    return { disabled: [], unreadable: WORKSPACE_FEATURE_CAPABILITIES.map(([, c]) => c) };
  }
}

async function userDisabledCapabilities(
  db: DatabaseAdapter,
  userId: string,
): Promise<PlatformCapability[]> {
  const codeExecution = await resolveCloudCodeExecutionPolicy(db, userId);
  return !codeExecution.allowed && codeExecution.reason === 'disabled'
    ? ['canUseCloudExecution']
    : [];
}

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
    await attributeReferralFromRequest(request, userId);

    let clerkName: string | undefined;
    let verifiedProfileEmail: string | null = null;
    let resolvedEmail = email ?? undefined;
    try {
      let nameTimer: ReturnType<typeof setTimeout> | undefined;
      const identityUser = await Promise.race([
        getIdentityUser(userId).finally(() => {
          if (nameTimer) clearTimeout(nameTimer);
        }),
        new Promise<never>((_, reject) => {
          nameTimer = setTimeout(
            () => reject(new Error('identity user lookup timeout')),
            IDENTITY_LOOKUP_TIMEOUT_MS,
          );
        }),
      ]);
      clerkName =
        identityUser?.fullName ?? identityUser?.firstName ?? identityUser?.username ?? undefined;
      resolvedEmail = resolvedEmail ?? identityUser?.primaryEmail ?? undefined;
      if (identityUser?.primaryEmailVerification === 'verified') {
        verifiedProfileEmail = identityUser.primaryEmail;
      }
      if (identityUser && identityUser.enterpriseAccounts.length > 0) {
        await provisionEnterpriseSignIn(getNeonDb(), identityUser).catch((jitError: unknown) => {
          logger.error(
            { userId, error: jitError },
            'Single sign-on first sign-in provisioning failed',
          );
        });
      }
    } catch (identityLookupError) {
      logger.warn(
        { userId, error: identityLookupError },
        'Failed to resolve the identity profile name',
      );
    }

    if (resolvedEmail) {
      const scimLink = await linkPendingScimUsersAtSignIn(getNeonDb(), userId, resolvedEmail);
      if (scimLink.failed > 0) {
        logger.error(
          { userId, failed: scimLink.failed },
          'One or more pending directory memberships could not be linked at sign-in',
        );
      }
    }

    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
    const [entitlement, identity] = await Promise.all([
      resolveEntitlementBundle(db, userId, { throwOnSeatLookupError: true }),
      readUserIdentity(db, userId),
    ]);
    const subscription = entitlement.subscription;
    const profile = identity.profile;

    if (
      (!identity.displayName && (clerkName || resolvedEmail)) ||
      (!profile?.email?.trim() && verifiedProfileEmail)
    ) {
      await backfillProfileFromUpstream(
        db,
        userId,
        resolveVisibleName(identity, clerkName, resolvedEmail),
        verifiedProfileEmail,
      );
    }

    const rawRoutingPreferences = profile?.routing_preferences;
    const routing_preferences =
      rawRoutingPreferences &&
      typeof rawRoutingPreferences === 'object' &&
      !Array.isArray(rawRoutingPreferences)
        ? (rawRoutingPreferences as { us_only?: boolean; geo_overlay?: string })
        : {};

    const effectiveTier = entitlement.plan;

    const searchParams = new URL(request.url).searchParams;
    const requestedSurface = searchParams.get('surface');
    const surface: SyncedAppSurface = (SYNCED_APP_SURFACES as readonly string[]).includes(
      requestedSurface ?? '',
    )
      ? (requestedSurface as SyncedAppSurface)
      : 'web';
    // A ring is opt-in, so an unrecognised or absent channel is handed nothing
    // rather than the widest population.
    const requestedChannel = searchParams.get('channel');
    const channel: ReleaseChannel = (RELEASE_CHANNELS as readonly string[]).includes(
      requestedChannel ?? '',
    )
      ? (requestedChannel as ReleaseChannel)
      : 'stable';

    const membership = await resolveOrgMembership(db, userId).catch((membershipError: unknown) => {
      logger.warn(
        { userId, error: membershipError },
        'Active workspace unreadable; flags evaluate without workspace targeting',
      );
      return null;
    });
    const flagSubject = buildFlagSubject(request, {
      userId,
      workspaceId: membership?.organizationId ?? null,
      role: membership?.role ?? null,
      plan: effectiveTier,
      surface,
    });
    const rolloutFlags = clientVisibleFlags(await evaluateFlagsForSubject(flagSubject));
    const killSwitches = await readKillSwitchGate(flagSubject).catch((gateError: unknown) => {
      logger.error(
        { userId, error: gateError },
        'Kill-switch gate unreadable; capabilities are reported as shipped',
      );
      return null;
    });

    const rolloutGate = await readRolloutGate(flagSubject).catch((ringError: unknown) => {
      logger.error(
        { userId, error: ringError },
        'Rollout ring gate unreadable; no staged change is offered',
      );
      return null;
    });
    const openRings = Object.fromEntries(
      (rolloutGate?.openRingIds(surface, channel) ?? []).map((id) => [
        rolloutRingKey(surface, channel, id),
        true,
      ]),
    );

    const feature_flags = {
      ...rolloutFlags.enabled,
      ...openRings,
      advanced_model_access: canAccessManualModelSelection(effectiveTier),
      code_execution: e2bCutoverEnabled(),
      generic_web_search: webSearchBackendConfigured(),
    };

    const workspaceCapabilities = await workspaceCapabilityDecisions(userId, request);
    const capability_handshake = buildMeCapabilityHandshake({
      userId,
      tier: effectiveTier,
      catalogVersion: entitlement.catalogVersion,
      surface,
      cloudExecutionDeploymentEnabled: feature_flags.code_execution,
      closedCapabilities: platformCapabilitiesOf([
        ...(killSwitches?.closedCapabilities ?? []),
        ...workspaceCapabilities.unreadable,
      ]),
      userDisabledCapabilities: await userDisabledCapabilities(db, userId),
      workspaceDisabledCapabilities: workspaceCapabilities.disabled,
      resets: await getCapabilityLimitResets(db, userId, subscription?.current_period_end ?? null),
    });

    const subscriptionSource = entitlement.seatSource
      ? 'manual'
      : resolveSubscriptionBillingSource(subscription);
    const wirePlan = wirePlanOf(subscription?.plan_tier);
    const plan = {
      tier: wirePlan.tier,
      display_name: getBillingPlanPricing(wirePlan.tier).label,
      status: subscription?.status || 'none',
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime() / 1000
        : null,
      cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
      effective_tier: wirePlanOf(effectiveTier).tier,
      ...seatTypeField(wirePlanOf(effectiveTier).seatType),
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
      feature_flag_variants: rolloutFlags.variants,
      routing_preferences,
      capability_handshake: toWireCapabilityHandshake(capability_handshake),
      disabled_features: await closedFeatures(killSwitches?.closedCapabilities ?? []),
      workspace_data_region: await workspaceDataRegion(db, membership?.organizationId ?? null),
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

async function workspaceDataRegion(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<MeWorkspaceDataRegion | null> {
  if (!organizationId) return null;
  try {
    const { effective } = await readOrganizationRegion(db, organizationId);
    return { id: effective, label: DATA_REGIONS[effective].label };
  } catch (error) {
    logger.warn(
      { organizationId, error },
      'Workspace data region unreadable; omitted from /api/me',
    );
    return null;
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
