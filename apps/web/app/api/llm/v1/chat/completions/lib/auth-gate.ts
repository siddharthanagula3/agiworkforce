import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser, isAccountUnavailableError } from '@/lib/api-auth';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
import { resolveEffectiveSubscription } from '@/lib/services/effective-subscription-service';
import { buildFreeWebsiteSubscription, isFreePlanTier } from '@/lib/services/free-trial-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  canUseManagedCloudChatSurface,
  getCloudChatSurfaceCapability,
  type AuthenticatedSurfaceClass,
  type BoundSurface,
} from '@/lib/free-chat-surface-policy';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { isPasskeyRequiredError } from '@/lib/server/account-security/gate';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { readOrganizationCollectionState } from '@/lib/services/enterprise-collection-state';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import {
  resolveSubscriptionAccess,
  type EnterpriseCollectionAccessState,
} from '@/lib/services/subscription-access-policy';
import { timePhase } from '@/lib/observability/phase-timer';
import { developerProjectSpendRefusal } from '@/lib/developer-api/project-spend';
import { resolveAuthenticatedSurface } from './request-surface';
import { CHAT_TURN_PHASE } from './turn-phases';
import {
  CURRENT_TERMS_VERSION,
  readTermsStanding,
  termsNoticeHeaders,
  type TermsStanding,
} from '@/lib/server/terms';
import { recordFailure } from '@/lib/observability/metrics';

const ENTERPRISE_PLAN_TIER = 'enterprise';

async function resolveEnterpriseCollectionAccessState(
  userId: string,
): Promise<EnterpriseCollectionAccessState> {
  try {
    const db = getNeonDb();
    const organizationId = await resolveEnterpriseFundingOrganizationId(db, userId);
    if (!organizationId) return { readOnly: false };
    const state = await readOrganizationCollectionState(db, organizationId);
    return { readOnly: state.readOnly };
  } catch (error) {
    logger.error(
      { error, userId },
      '[auth-gate] enterprise collection state read failed; entitlement decided without it',
    );
    return { readOnly: false };
  }
}

export type AuthGateSuccess = {
  ok: true;
  userId: string;
  token: string;
  subscription: SubscriptionInfo;
  surfaceClass?: AuthenticatedSurfaceClass;
  boundSurface?: BoundSurface;
  apiKeyId?: string;
  /** Headers telling the client a newer Terms of Service version is published. */
  termsNotice?: Record<string, string>;
};

type AuthGateFailure = {
  ok: false;
  response: NextResponse | Response;
};

export type AuthGateResult = AuthGateSuccess | AuthGateFailure;

export type AnyResponse = NextResponse | Response;

function enforceManagedCloudSurface(
  request: NextRequest,
  success: AuthGateSuccess,
): AuthGateResult {
  const surface = resolveAuthenticatedSurface(request, success);
  if (canUseManagedCloudChatSurface(success.subscription.plan_tier, surface)) return success;

  const capability = getCloudChatSurfaceCapability(surface);
  const error =
    capability === null
      ? {
          message:
            'This credential is not bound to an AGI client. Use the AGI web, desktop or mobile app, the browser extension, the CLI or the IDE extension, or an API key.',
          code: 'managed_cloud_surface_unknown',
        }
      : capability === 'developer_surfaces'
        ? {
            message: 'Managed Cloud CLI, browser extension, and IDE access require Pro or higher.',
            code: 'developer_surface_plan_required',
            requiredTier: 'pro',
          }
        : capability === 'managed_api'
          ? {
              message: 'Managed API access requires Pro or higher.',
              code: 'managed_api_plan_required',
              requiredTier: 'pro',
            }
          : {
              message: 'Managed Cloud chat is not available on this plan.',
              code: 'managed_chat_plan_required',
            };

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: {
          ...error,
          type: 'invalid_request_error',
        },
      },
      { status: 403 },
    ),
  };
}

function termsRefusal(
  request: NextRequest,
  standing: Extract<TermsStanding, { kind: 'required' }>,
): NextResponse {
  const acceptanceUrl = new URL('/login/complete', new URL(request.url).origin);
  acceptanceUrl.searchParams.set('redirectTo', '/chat');
  const message =
    standing.reason === 'never_accepted'
      ? `Accept the Terms of Service at ${acceptanceUrl.toString()} to start using AGI Workforce, then try again.`
      : `The Terms of Service were updated. Accept the updated terms at ${acceptanceUrl.toString()} to keep using AGI Workforce, then try again.`;
  return NextResponse.json(
    {
      error: {
        message,
        type: 'invalid_request_error',
        code: 'terms_acceptance_required',
        acceptance_url: acceptanceUrl.toString(),
      },
      terms_version: CURRENT_TERMS_VERSION,
      acceptance_url: acceptanceUrl.toString(),
    },
    { status: 403 },
  );
}

/**
 * Terms acceptance is a notice requirement, not a safety kill switch. A call
 * made with an API key runs under the commercial terms its owner already
 * agreed to and is never refused per call. Any other caller with no acceptance
 * on record, or one past the effective date of a material revision it has not
 * accepted, is refused with a link to accept; a caller on an older but still
 * valid version passes with a notice. When the acceptance cannot be read the
 * turn is allowed, logged and counted rather than locking every account out.
 */
async function checkTermsStanding(
  request: NextRequest,
  userId: string,
): Promise<{ refusal: NextResponse } | { notice?: Record<string, string> }> {
  let standing: TermsStanding;
  try {
    standing = await readTermsStanding(userId);
  } catch (error) {
    logger.error({ error, userId }, '[auth-gate] terms acceptance unreadable; allowing the turn');
    recordFailure('database', 'terms_acceptance_unreadable');
    return {};
  }
  if (standing.kind === 'current') return {};
  if (standing.kind === 'required') {
    return { refusal: termsRefusal(request, standing) };
  }
  return { notice: termsNoticeHeaders(standing) };
}

export async function runAuthGate(request: NextRequest): Promise<AuthGateResult> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return { ok: false, response: preflightResponse };
  }

  const ipRateLimitResponse = await timePhase(CHAT_TURN_PHASE.rateLimitIp, () =>
    withRateLimit(request, 'llm-completion-ip'),
  );
  if (ipRateLimitResponse) return { ok: false, response: ipRateLimitResponse };

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Missing or invalid authorization header',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.substring(7);

  let userId: string;
  let surfaceClass: AuthenticatedSurfaceClass | undefined;
  let boundSurface: BoundSurface | undefined;
  let apiKeyId: string | undefined;
  try {
    ({ userId, surfaceClass, boundSurface, apiKeyId } = await timePhase(
      CHAT_TURN_PHASE.identityVerify,
      () => getClerkAuthUser(request, { apiKeyScope: 'inference:write' }),
    ));
  } catch (error) {
    if (isMfaRequiredError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: { message: error.message, type: 'invalid_request_error', code: 'mfa_required' },
          },
          { status: 403 },
        ),
      };
    }
    if (isPasskeyRequiredError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: error.message,
              type: 'invalid_request_error',
              code: 'passkey_required',
              ...(error.details ? { details: error.details } : {}),
            },
          },
          { status: 403 },
        ),
      };
    }
    if (isIpNotAllowedError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: error.message,
              type: 'invalid_request_error',
              code: 'ip_not_allowed',
            },
          },
          { status: 403 },
        ),
      };
    }
    if (isAccountUnavailableError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: error.message,
              type: 'invalid_request_error',
              code: 'account_unavailable',
              ...(error.details ? { details: error.details } : {}),
            },
          },
          { status: 403 },
        ),
      };
    }
    const insufficientScope = isApiKeyScopeError(error);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: insufficientScope
              ? 'API key does not have the required scope'
              : 'Invalid authentication token',
            type: 'invalid_request_error',
            code: insufficientScope ? 'insufficient_scope' : 'invalid_api_key',
          },
        },
        { status: insufficientScope ? 403 : 401 },
      ),
    };
  }

  const credential: Pick<
    AuthGateSuccess,
    'surfaceClass' | 'boundSurface' | 'apiKeyId' | 'termsNotice'
  > = {
    ...(surfaceClass ? { surfaceClass } : {}),
    ...(boundSurface ? { boundSurface } : {}),
    ...(apiKeyId ? { apiKeyId } : {}),
  };

  const subscriptionPromise = resolveEffectiveSubscription(
    createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null }),
    userId,
  );
  subscriptionPromise.catch(() => undefined);

  const csrfError = await timePhase(CHAT_TURN_PHASE.csrfCheck, () => requireCsrfToken(request));
  if (csrfError) return { ok: false, response: csrfError };

  const userRateLimitResponse = await timePhase(CHAT_TURN_PHASE.rateLimitUser, () =>
    withRateLimit(request, 'llm-completion', `user:${userId}`),
  );
  if (userRateLimitResponse) return { ok: false, response: userRateLimitResponse };

  if (!apiKeyId) {
    const terms = await checkTermsStanding(request, userId);
    if ('refusal' in terms) return { ok: false, response: terms.refusal };
    if (terms.notice) credential.termsNotice = terms.notice;
  }

  if (apiKeyId) {
    const spendRefusal = await developerProjectSpendRefusal({ userId, apiKeyId });
    if (spendRefusal) return { ok: false, response: spendRefusal };
  }

  const subscription = await timePhase(
    CHAT_TURN_PHASE.subscriptionLookup,
    () => subscriptionPromise,
  );

  if (!subscription) {
    return enforceManagedCloudSurface(request, {
      ok: true,
      userId,
      token,
      subscription: buildFreeWebsiteSubscription(userId),
      ...credential,
    });
  }

  const enterpriseCollection =
    subscription.plan_tier?.toLowerCase() === ENTERPRISE_PLAN_TIER
      ? await resolveEnterpriseCollectionAccessState(userId)
      : undefined;

  const access = resolveSubscriptionAccess(
    subscription.status,
    subscription.plan_tier,
    enterpriseCollection,
  );

  if (!access.managedExecution) {
    if (isFreePlanTier(subscription.plan_tier)) {
      return enforceManagedCloudSurface(request, {
        ok: true,
        userId,
        token,
        subscription: {
          ...subscription,
          status: 'active',
        },
        ...credential,
      });
    }

    const billingReadOnly = enterpriseCollection?.readOnly === true;

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: billingReadOnly
              ? 'Your workspace is read-only: enterprise billing collection is past the read-only threshold. Ask your billing owner to resolve the outstanding invoice.'
              : `Subscription is ${subscription.status}. Please update your payment method.`,
            type: 'invalid_request_error',
            code: billingReadOnly ? 'billing_read_only' : 'subscription_inactive',
          },
        },
        { status: 403 },
      ),
    };
  }

  return enforceManagedCloudSurface(request, {
    ok: true,
    userId,
    token,
    subscription,
    ...credential,
  });
}
