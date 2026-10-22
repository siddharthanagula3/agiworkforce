import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
  formatPrivacyModeLabel,
} from '@agiworkforce/types';
import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import { logger } from '@/lib/logger';
import {
  buildModelPolicyGateResponse,
  buildProviderEgressGateResponse,
} from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
import type { UserScopedDb } from '@/lib/server/rls-db';
import {
  ArtifactRuntimeRouteUnavailableError,
  buildArtifactConnectorPlan,
  completeArtifactPrompt,
  selectArtifactRuntimeRoute,
  type ArtifactRuntimeSubject,
  type OwnedRunnableArtifact,
} from '@/lib/services/artifact-runtime-service';
import { connectorIdsReachGoogleUserData } from '@/lib/connectors/google-user-data-runs';
import { artifactConnectorsGateResponse } from '@/lib/services/artifact-connector-gate';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { enforceManagedContentSafetyPreference } from '@/lib/services/managed-content-safety-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import {
  evaluateActiveWorkspacePolicy,
  resolveZeroDataRetentionPolicy,
} from '@/lib/services/organization-policy-gate';
import type { ArtifactRuntimeCompleteResponse } from '@agiworkforce/cloud-contracts';
import { connectorDisplayName } from '@/app/chat/live-artifacts/live-artifact-contract';

export const ARTIFACT_RUNTIME_NO_STORE = { 'Cache-Control': 'private, no-store' };

export function artifactRuntimeRefusal(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: ARTIFACT_RUNTIME_NO_STORE },
  );
}

export function ownedArtifactOriginRefusal(
  artifact: Pick<OwnedRunnableArtifact, 'originPrivacyMode'>,
): NextResponse | null {
  if (artifact.originPrivacyMode === 'managed') return null;
  return artifactRuntimeRefusal(
    403,
    'artifact_outside_managed_cloud',
    `Only an app made in a ${formatPrivacyModeLabel('managed')} chat can use AI and your connected apps.`,
  );
}

const WORDING = {
  published: {
    zeroRetention:
      'Your workspace requires zero data retention, which AI in published apps does not offer yet.',
    connectorsUnavailable: 'Your plan cannot use connected apps from published apps.',
  },
  owned: {
    zeroRetention:
      'Your workspace requires zero data retention, which AI in artifacts does not offer yet.',
    connectorsUnavailable: 'Your plan cannot use connected apps from artifacts.',
  },
} as const;

export interface ArtifactCompletionInput {
  request: NextRequest;
  scoped: UserScopedDb;
  subject: ArtifactRuntimeSubject;
  prompt: string;
  connectors: readonly string[];
  allowedTools: readonly string[];
  sourceHoldsGoogleUserData: () => Promise<boolean>;
  onCompleted?: () => Promise<void>;
}

export async function respondToArtifactCompletion(
  input: ArtifactCompletionInput,
): Promise<Response> {
  const { request, scoped, subject } = input;
  const wording = WORDING[subject.kind];
  const connectors = [...new Set(input.connectors)];
  if (connectors.length > 0 && !connectorsReleased()) {
    return artifactRuntimeRefusal(403, 'connectors_coming_soon', CONNECTORS_COMING_SOON_MESSAGE);
  }

  const privacy = await evaluateActiveWorkspacePolicy(
    scoped.db,
    scoped.userId,
    { resource: 'privacy_mode', mode: 'managed' },
    request,
  );
  if (!privacy.allowed) {
    return artifactRuntimeRefusal(
      403,
      privacy.code ?? 'organization_policy',
      privacy.reason ?? 'Your workspace policy does not allow this request.',
    );
  }

  const entitlement = await resolveEntitlementBundle(scoped.db, scoped.userId);
  const access = await evaluateManagedComputeAccess(
    scoped.db,
    scoped.userId,
    entitlement.subscription,
    'web',
    { request },
    connectors.length > 0 ? 'artifact_connectors' : undefined,
  );
  const accessGate = buildManagedComputeAccessGateResponse(access, ARTIFACT_RUNTIME_NO_STORE);
  if (accessGate) return accessGate;
  if (connectors.length > 0) {
    const connectorGate = await artifactConnectorsGateResponse(
      scoped.userId,
      request,
      entitlement.plan,
      ARTIFACT_RUNTIME_NO_STORE,
    );
    if (connectorGate) return connectorGate;
  }

  const retention = await resolveZeroDataRetentionPolicy(scoped.db, scoped.userId);
  if (retention.required) {
    return artifactRuntimeRefusal(403, 'organization_policy', wording.zeroRetention);
  }

  const moderation = moderateManagedPrompt({
    userId: scoped.userId,
    segments: [input.prompt],
  });
  if (!moderation.allowed) {
    return artifactRuntimeRefusal(422, 'content_policy_violation', moderation.refusal);
  }
  try {
    const safety = await enforceManagedContentSafetyPreference(scoped.db, {
      userId: scoped.userId,
      prompt: input.prompt,
    });
    if (!safety.allowed) {
      return artifactRuntimeRefusal(422, 'reduce_sensitive_content', safety.refusal);
    }
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, '[artifact-runtime] content safety unread');
    return artifactRuntimeRefusal(
      503,
      'content_safety_preference_unavailable',
      'Your content safety preference could not be verified. No model request was sent.',
    );
  }

  const secrets = await applySecretHandlingToTexts(scoped.userId, [input.prompt]);
  if (secrets.action === 'blocked') {
    return artifactRuntimeRefusal(
      403,
      'secrets_blocked',
      'Remove sensitive credentials before sending.',
    );
  }
  const prompt = secrets.texts[0] ?? input.prompt;

  // Decided per run: a Google connector the run can call, or an artifact made
  // in a chat that holds Google user data, keeps the whole run off models that
  // may train. Unreadable counts as marked.
  const googleUserData =
    connectorIdsReachGoogleUserData(connectors) || (await input.sourceHoldsGoogleUserData());

  let route;
  try {
    route = await selectArtifactRuntimeRoute(scoped.db, scoped.userId, prompt, entitlement.plan, {
      needsTools: connectors.length > 0,
      googleUserData,
    });
  } catch (error) {
    if (error instanceof ArtifactRuntimeRouteUnavailableError) {
      return artifactRuntimeRefusal(503, 'model_unavailable', error.message);
    }
    throw error;
  }

  const modelGate = await buildModelPolicyGateResponse(
    scoped.userId,
    request,
    { provider: route.provider, modelId: route.modelKey },
    ARTIFACT_RUNTIME_NO_STORE,
  );
  if (modelGate) return modelGate;
  const egress = await buildProviderEgressGateResponse(
    {
      mode: 'managed',
      surface: 'web',
      userId: scoped.userId,
      routeKeyAttribution: 'platform-key',
      isFallback: false,
      payload: prompt,
    },
    ARTIFACT_RUNTIME_NO_STORE,
  );
  if (egress) return egress;

  const plan =
    connectors.length > 0
      ? await buildArtifactConnectorPlan({
          db: scoped.db,
          userId: scoped.userId,
          organizationId: scoped.organizationId,
          planTier: entitlement.plan,
          modelKey: route.modelKey,
          connectors,
          allowedTools: input.allowedTools,
          request,
        })
      : null;
  if (connectors.length > 0 && !plan) {
    return artifactRuntimeRefusal(403, 'connectors_unavailable', wording.connectorsUnavailable);
  }
  if (plan && plan.unusable.length > 0) {
    const one = plan.unusable.length === 1;
    return artifactRuntimeRefusal(
      409,
      'connectors_not_ready',
      `This app uses ${plan.unusable.map(connectorDisplayName).join(', ')}. Connect ${one ? 'it' : 'them'} in Settings, Connectors, and let ${one ? 'its' : 'their'} tools run without asking, to use this part of the app.`,
    );
  }

  try {
    const text = await completeArtifactPrompt({
      db: scoped.db,
      userId: scoped.userId,
      organizationId: scoped.organizationId,
      subject,
      prompt,
      route,
      planTier: entitlement.plan,
      signal: request.signal,
      plan,
      idempotencyKey: request.headers.get('idempotency-key'),
    });
    if (input.onCompleted) {
      await input.onCompleted().catch((error: unknown) => {
        logger.warn({ error, userId: scoped.userId }, '[artifact-runtime] refresh not recorded');
      });
    }
    const body: ArtifactRuntimeCompleteResponse = { text };
    return NextResponse.json(body, { headers: ARTIFACT_RUNTIME_NO_STORE });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return artifactRuntimeRefusal(error.status, error.code, error.message);
    }
    if (error instanceof ArtifactRuntimeRouteUnavailableError) {
      return artifactRuntimeRefusal(503, 'model_unavailable', error.message);
    }
    throw error;
  }
}
