import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import type { ResolvedWorkspaceControls, WorkspaceFeature } from '@agiworkforce/types';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { evaluateModelAccessForRequest } from '@/lib/services/model-policy-gate';
import { evaluateSpendLimit } from '@/lib/services/spend-limit-service';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  evaluateActiveWorkspacePolicy,
  resolveEffectiveWorkspaceControls,
} from '@/lib/services/organization-policy-gate';
import {
  isPolicyUnavailable,
  WORKSPACE_POLICY_UNAVAILABLE_DECISION,
  type PolicySurface,
} from '@/lib/services/organization-policy-evaluator';

export const MANAGED_COMPUTE_PRIVATE_BETA_ENV = 'AGI_MANAGED_COMPUTE_PRIVATE_BETA';
export const MANAGED_COMPUTE_BETA_HEADER = 'x-agi-managed-compute-beta';
export const MANAGED_COMPUTE_ORG_HEADER = MANAGED_CLOUD_ORGANIZATION_HEADER;

export interface ManagedComputeDescriptor {
  provider: string;
  model: string;
  feature?: string;
  isFreeTrial?: boolean;
}

function headerValue(request: NextRequest, name: string): string | null {
  return request.headers.get(name);
}

export function isManagedComputePrivateBetaEnabled(): boolean {
  const raw = process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV]?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

export function buildManagedComputeGateResponse(
  request: NextRequest,
  descriptor: ManagedComputeDescriptor,
  headers?: HeadersInit,
): NextResponse | null {
  const base = {
    provider: descriptor.provider,
    model: descriptor.model,
    feature: descriptor.feature ?? 'managed_compute',
    organization_id: headerValue(request, MANAGED_COMPUTE_ORG_HEADER) ?? 'unscoped',
    checked_at: new Date().toISOString(),
  };

  if (!isManagedComputePrivateBetaEnabled()) {
    logger.warn(
      { feature: base.feature, model: base.model, isFreeTrial: descriptor.isFreeTrial === true },
      '[managed-compute-gate] kill-switch engaged; refusing managed compute',
    );

    return NextResponse.json(
      {
        error: {
          message:
            'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
          type: 'managed_compute_private_beta',
          code: 'public_launch_blocked',
        },
        managed_compute: { ...base, allowed: false },
      },
      { status: 403, headers },
    );
  }

  return null;
}

/**
 * The workspace-policy sibling of the kill-switch gate above.
 *
 * Separate function because the two answer different questions and must not be
 * collapsed: the kill-switch is ours and applies to everyone, while this is the
 * customer administrator's decision and applies only inside their workspace. It
 * is async because that decision lives in the database, which is also why it
 * cannot be folded into `buildManagedComputeGateResponse`.
 *
 * Returns null when the request is unscoped or permitted, so callers keep the
 * same `if (response) return response` shape as the gate above.
 */
export async function buildOrganizationPolicyGateResponse(
  userId: string,
  request: NextRequest,
  descriptor: ManagedComputeDescriptor & { surface: PolicySurface },
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  let decision;
  try {
    decision = await evaluateActiveWorkspacePolicy(
      getNeonDb(),
      userId,
      { resource: 'managed_compute', surface: descriptor.surface },
      request,
    );
  } catch (error) {
    logger.error(
      { error, userId, feature: descriptor.feature ?? 'managed_compute' },
      '[managed-compute-gate] workspace policy unavailable; request denied',
    );
    decision = { ...WORKSPACE_POLICY_UNAVAILABLE_DECISION, organizationId: null };
  }

  if (decision.allowed) return null;

  logger.warn(
    {
      userId,
      organizationId: decision.organizationId,
      code: decision.code,
      feature: descriptor.feature ?? 'managed_compute',
      surface: descriptor.surface,
    },
    '[managed-compute-gate] denied by workspace policy',
  );

  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'organization_policy',
        code: decision.code,
      },
      managed_compute: {
        provider: descriptor.provider,
        model: descriptor.model,
        feature: descriptor.feature ?? 'managed_compute',
        organization_id: decision.organizationId ?? 'unscoped',
        checked_at: new Date().toISOString(),
        allowed: false,
      },
    },
    { status: isPolicyUnavailable(decision) ? 503 : 403, headers },
  );
}

export async function buildWorkspaceFeatureGateResponse(
  userId: string,
  request: NextRequest,
  feature: WorkspaceFeature,
  surface: PolicySurface,
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  let decision;
  try {
    decision = await evaluateActiveWorkspacePolicy(
      getNeonDb(),
      userId,
      { resource: 'feature', feature, surface },
      request,
    );
  } catch (error) {
    logger.error({ error, userId, feature }, '[workspace-feature] policy unavailable; denied');
    decision = { ...WORKSPACE_POLICY_UNAVAILABLE_DECISION, organizationId: null };
  }

  if (decision.allowed) return null;

  logger.warn(
    { userId, organizationId: decision.organizationId, code: decision.code, feature, surface },
    '[workspace-feature] denied by workspace policy',
  );

  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'organization_policy',
        code: decision.code,
        feature,
      },
    },
    { status: isPolicyUnavailable(decision) ? 503 : 403, headers },
  );
}

export type WorkspaceControlsResolution =
  { ok: true; controls: ResolvedWorkspaceControls | null } | { ok: false; response: NextResponse };

export async function resolveWorkspaceControlsForRequest(
  userId: string,
  request: NextRequest,
  headers?: HeadersInit,
): Promise<WorkspaceControlsResolution> {
  try {
    const effective = await resolveEffectiveWorkspaceControls(getNeonDb(), userId, request);
    return { ok: true, controls: effective?.controls ?? null };
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 503;
    const decision = status < 500 ? null : WORKSPACE_POLICY_UNAVAILABLE_DECISION;
    logger.error({ error, userId }, '[workspace-controls] unresolved; request denied');
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message:
              decision?.reason ??
              'You are not a member of the selected workspace. Choose a workspace you belong to, then try again.',
            type: 'organization_policy',
            code: decision?.code ?? 'workspace_not_accessible',
          },
        },
        { status: status < 500 ? 403 : 503, headers },
      ),
    };
  }
}

/**
 * Refuses a request whose resolved model the workspace does not permit.
 *
 * Separate from `buildOrganizationPolicyGateResponse` because the two answer at
 * different moments. The policy gate runs on admission, before a model exists;
 * this one runs once the route has picked the model it will actually call, and
 * only that second point can catch a model reached through routing or a
 * provider default rather than by name.
 *
 * Returns null when allowed, so a call site reads the same way as the other
 * gates in this file.
 */
export async function buildModelPolicyGateResponse(
  userId: string,
  request: NextRequest,
  model: { provider: string | null; modelId: string | null },
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  const decision = await evaluateModelAccessForRequest(userId, model, request);
  if (decision.allowed) return null;

  logger.warn(
    { userId, provider: model.provider, model: model.modelId, code: decision.code },
    '[model-policy] request refused by workspace model policy',
  );

  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'invalid_request_error',
        code: decision.code,
      },
    },
    { status: 403, headers },
  );
}

/**
 * Refuses a request that would mint an anonymous public link when the caller's
 * workspace has turned public sharing off.
 *
 * Only NEW links are refused. A link already published stays reachable, because
 * revoking published content is a different decision with different
 * consequences, a member who shared a document with a customer last week
 * should not have it break because an administrator changed a setting today.
 * The policy copy says so, and so does the settings panel.
 */
export async function buildExternalSharingGateResponse(
  userId: string,
  request: NextRequest,
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  let decision;
  try {
    decision = await evaluateActiveWorkspacePolicy(
      getNeonDb(),
      userId,
      { resource: 'external_sharing' },
      request,
    );
  } catch (error) {
    logger.error(
      { error, userId },
      '[external-sharing] workspace policy unavailable; request denied',
    );
    decision = { ...WORKSPACE_POLICY_UNAVAILABLE_DECISION, organizationId: null };
  }

  if (decision.allowed) return null;

  logger.warn({ userId, code: decision.code }, '[external-sharing] refused by workspace policy');

  return NextResponse.json(
    { error: { message: decision.reason, type: 'forbidden', code: decision.code } },
    { status: isPolicyUnavailable(decision) ? 503 : 403, headers },
  );
}

/**
 * Refuses a metered turn once the workspace has reached a spend limit it chose
 * to enforce.
 *
 * Only the `block` mode refuses; `notify` exists so a finance owner can watch a
 * budget before deciding to enforce it. The decision is cached briefly, so
 * enforcement is eventual rather than exact and a workspace can overshoot by
 * roughly one window of spend, the console says so rather than implying a hard
 * ceiling it does not have.
 *
 * Ungoverned on any failure, including an unresolvable workspace or an
 * unreachable database: a billing lookup failing is an infrastructure fault, and
 * refusing every member's work over it is worse than briefly overshooting.
 *
 * The budget is resolved against the funding organization, never the workspace
 * the request selected: a member who has reached the cap could otherwise send
 * `x-agi-organization-id: personal` and keep spending.
 */
export async function buildSpendLimitGateResponse(
  userId: string,
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  let decision;
  try {
    const db = getNeonDb();
    const organizationId = await resolveEnterpriseFundingOrganizationId(db, userId);
    decision = await evaluateSpendLimit(db, organizationId);
  } catch (error) {
    logger.error({ error, userId }, '[spend-limit] unavailable; request treated as ungoverned');
    return null;
  }

  if (decision.allowed) return null;

  logger.warn(
    { userId, code: decision.code, spentCents: decision.state?.spentCents },
    '[spend-limit] request refused by workspace budget',
  );

  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'insufficient_quota',
        code: decision.code,
      },
    },
    { status: 402, headers },
  );
}
