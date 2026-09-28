import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import {
  buildModelPolicyGateResponse,
  buildProviderEgressGateResponse,
} from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ARTIFACT_RUNTIME_MAX_PROMPT_CHARS,
  ArtifactRuntimeRouteUnavailableError,
  completeArtifactPrompt,
  readRunnableArtifact,
  selectArtifactRuntimeRoute,
} from '@/lib/services/artifact-runtime-service';
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
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const CompleteSchema = z.object({
  prompt: z.string().min(1).max(ARTIFACT_RUNTIME_MAX_PROMPT_CHARS),
});

type RouteContext = { params: Promise<{ token: string }> };

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

const UNAVAILABLE_MESSAGE = 'This app is no longer available.';

async function handlePost(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return refusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);
  }

  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'llm-completion', `user:${scoped.userId}`);
  if (limited) return limited;

  const parsed = CompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refusal(
      400,
      'invalid_prompt',
      `Send a prompt of 1 to ${ARTIFACT_RUNTIME_MAX_PROMPT_CHARS.toLocaleString('en-US')} characters.`,
    );
  }

  const artifact = await readRunnableArtifact(scoped.db, token);
  if (!artifact) return refusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);

  const privacy = await evaluateActiveWorkspacePolicy(
    scoped.db,
    scoped.userId,
    { resource: 'privacy_mode', mode: 'managed' },
    request,
  );
  if (!privacy.allowed) {
    return refusal(
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
  );
  const accessGate = buildManagedComputeAccessGateResponse(access, NO_STORE);
  if (accessGate) return accessGate;

  const retention = await resolveZeroDataRetentionPolicy(scoped.db, scoped.userId);
  if (retention.required) {
    return refusal(
      403,
      'organization_policy',
      'Your workspace requires zero data retention, which AI in published apps does not offer yet.',
    );
  }

  const moderation = moderateManagedPrompt({
    userId: scoped.userId,
    segments: [parsed.data.prompt],
  });
  if (!moderation.allowed) return refusal(422, 'content_policy_violation', moderation.refusal);
  try {
    const safety = await enforceManagedContentSafetyPreference(scoped.db, {
      userId: scoped.userId,
      prompt: parsed.data.prompt,
    });
    if (!safety.allowed) return refusal(422, 'reduce_sensitive_content', safety.refusal);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, '[artifact-runtime] content safety unread');
    return refusal(
      503,
      'content_safety_preference_unavailable',
      'Your content safety preference could not be verified. No model request was sent.',
    );
  }

  const secrets = await applySecretHandlingToTexts(scoped.userId, [parsed.data.prompt]);
  if (secrets.action === 'blocked') {
    return refusal(403, 'secrets_blocked', 'Remove sensitive credentials before sending.');
  }
  const prompt = secrets.texts[0] ?? parsed.data.prompt;

  let route;
  try {
    route = await selectArtifactRuntimeRoute(scoped.db, scoped.userId, prompt, entitlement.plan);
  } catch (error) {
    if (error instanceof ArtifactRuntimeRouteUnavailableError) {
      return refusal(503, 'model_unavailable', error.message);
    }
    throw error;
  }

  const modelGate = await buildModelPolicyGateResponse(
    scoped.userId,
    request,
    { provider: route.provider, modelId: route.modelKey },
    NO_STORE,
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
    NO_STORE,
  );
  if (egress) return egress;

  try {
    const text = await completeArtifactPrompt({
      db: scoped.db,
      userId: scoped.userId,
      organizationId: scoped.organizationId,
      artifact,
      prompt,
      route,
      planTier: entitlement.plan,
      signal: request.signal,
    });
    return NextResponse.json({ text }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return refusal(error.status, error.code, error.message);
    }
    throw error;
  }
}

export const POST = withErrorHandler(handlePost);
