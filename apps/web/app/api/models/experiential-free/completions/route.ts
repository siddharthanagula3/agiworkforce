import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { freeQuotaPlanAllows, loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import {
  experientialFreeConfiguration,
  loadExperientialFreeOfferings,
} from '@/lib/server/experiential-free';
import {
  FreeOfferingRequestSchema,
  freeOfferingContentText,
  freeOfferingRequiresCodeExecution,
  freeOfferingRequiresWebAccess,
} from '@/features/models/lib/free-offering-request';
import { moderateManagedPrompt } from '@/lib/moderation';
import { enforceManagedContentSafetyPreference } from '@/lib/services/managed-content-safety-service';
import {
  buildModelPolicyGateResponse,
  buildProviderEgressGateResponse,
} from '@/lib/managed-compute-gate';
import {
  evaluateActiveWorkspacePolicy,
  resolveZeroDataRetentionPolicy,
} from '@/lib/services/organization-policy-gate';
import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import { SSE_RESPONSE_HEADERS } from '@/app/api/llm/v1/chat/completions/lib/sse-heartbeat';
import { logger } from '@/lib/logger';
import { persistFreeOfferingUser } from '@/lib/server/persist-free-offering-user';
import { validatePromotionalChatStream } from '@/features/models/lib/promotional-chat-stream';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function handlePost(request: NextRequest): Promise<Response> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId);
  const limit = await withRateLimit(request, 'llm-completion', `user:${scoped.userId}`);
  if (limit) return limit;

  const parsed = FreeOfferingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refusal(
      400,
      'free_quota_prompt_unsupported',
      'This promotional model currently supports text-only chat without tools or attachments. Choose a tool-capable Free model for web search or code execution.',
    );
  }
  const body = parsed.data;
  if (body.messages.some((message) => typeof message.content !== 'string')) {
    return refusal(
      400,
      'free_quota_attachment_unsupported',
      'This free model cannot read attachments. Remove the attachment or choose a compatible Free model. No model request was sent.',
    );
  }
  if (freeOfferingRequiresWebAccess(body)) {
    return refusal(
      400,
      'free_quota_search_unsupported',
      'This promotional model cannot search the web or open pages in Chat. Choose a search-capable Free model, such as Free Auto, and send your request again. No model request was sent.',
    );
  }
  if (freeOfferingRequiresCodeExecution(body)) {
    return refusal(
      400,
      'free_quota_code_unsupported',
      'This promotional model cannot run code in the sandbox. Choose Free Auto and send your request again. No model request was sent.',
    );
  }
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  if (!freeQuotaPlanAllows(planTier)) {
    return refusal(
      403,
      'model_not_available',
      'Experiential Labs free models require the Free plan.',
    );
  }
  const config = experientialFreeConfiguration();
  if (!config) {
    return refusal(
      503,
      'free_quota_unavailable',
      'Experiential Labs free routing is not configured.',
    );
  }
  const offerings = await loadExperientialFreeOfferings(config);
  const selected = offerings?.find((entry) => entry.key === body.model);
  if (!selected?.promotional || !selected.offering.providerModelId) {
    return refusal(503, 'free_quota_unavailable', 'This free promotion is not available now.');
  }

  const [conversation] = await scoped.db.query<{ id: string; data_region: string | null }>(
    'select c.id, o.data_region from web_conversations c left join organizations o on o.id = c.organization_id where c.id = $1 and c.user_id = $2 and c.organization_id is not distinct from $3 and c.deleted_at is null',
    [body.conversation_id, scoped.userId, scoped.organizationId],
  );
  if (!conversation) return refusal(404, 'conversation_not_found', 'Conversation not found.');

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
      privacy.reason ?? 'Workspace policy refused this route.',
    );
  }
  const modelGate = await buildModelPolicyGateResponse(scoped.userId, request, {
    provider: selected.offering.provider,
    modelId: selected.offering.providerModelId,
  });
  if (modelGate) return modelGate;
  const retention = await resolveZeroDataRetentionPolicy(scoped.db, scoped.userId);
  if (retention.required || conversation.data_region !== null) {
    return refusal(
      403,
      'organization_policy',
      'This route does not meet the workspace retention or data-region policy.',
    );
  }

  const texts = body.messages.map((message) => freeOfferingContentText(message.content));
  const moderation = moderateManagedPrompt({
    userId: scoped.userId,
    segments: texts.filter((text) => text.length > 0),
  });
  if (!moderation.allowed) return refusal(422, 'content_policy_violation', moderation.refusal);
  try {
    const safety = await enforceManagedContentSafetyPreference(scoped.db, {
      userId: scoped.userId,
      prompt: freeOfferingContentText(
        body.messages.findLast((message) => message.role === 'user')?.content ?? '',
      ),
    });
    if (!safety.allowed) return refusal(422, 'reduce_sensitive_content', safety.refusal);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, '[experiential-free] content safety unread');
    return refusal(
      503,
      'content_safety_preference_unavailable',
      'Content safety could not be verified.',
    );
  }
  const secrets = await applySecretHandlingToTexts(scoped.userId, texts);
  if (secrets.action === 'blocked') {
    return refusal(403, 'secrets_blocked', 'Remove sensitive credentials before sending.');
  }
  const messages = body.messages.map((message, index) => ({
    ...message,
    content: secrets.texts[index]!,
  }));
  const egress = await buildProviderEgressGateResponse({
    mode: 'managed',
    surface: 'web',
    userId: scoped.userId,
    routeKeyAttribution: 'platform-key',
    isFallback: false,
    payload: JSON.stringify(messages),
  });
  if (egress) return egress;

  const userPersistence = await persistFreeOfferingUser({
    db: scoped.db,
    userId: scoped.userId,
    organizationId: scoped.organizationId,
    conversationId: body.conversation_id,
    messages: body.messages,
    userMessage: body.user_message,
  });
  if (userPersistence) return userPersistence;

  const policy = loadFreeQuotaPolicy();
  const model = `${selected.offering.providerModelId}:free`;
  const url = new URL(`${config.baseUrl.replace(/\/?$/, '/')}chat/completions`);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.min(
          body.max_tokens ?? policy.chatMaxOutputTokens,
          policy.chatMaxOutputTokens,
        ),
        stream: true,
      }),
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(policy.chatRequestTimeoutMs)]),
    });
  } catch {
    return refusal(
      502,
      'provider_unreachable',
      "Experiential Labs did not respond. Try again or choose another free model. We didn't switch models or charge your account.",
    );
  }
  if (!upstream.ok || !upstream.body) {
    const payload: unknown = await upstream.json().catch(() => null);
    const nested =
      payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null;
    const code = nested && typeof nested === 'object' ? (nested as { code?: unknown }).code : null;
    if (code === 'free_limit_reached') {
      return refusal(
        409,
        'free_quota_exhausted',
        "Experiential Labs' free allowance for this model is used up. Choose another free model. We didn't switch models or charge your account.",
      );
    }
    if (upstream.status === 429) {
      return refusal(
        429,
        'provider_rate_limited',
        "Experiential Labs is busy for this free model. Try again shortly or choose another free model. We didn't switch models or charge your account.",
      );
    }
    return refusal(
      502,
      'provider_unreachable',
      "Experiential Labs could not serve this free request. Try again or choose another free model. We didn't switch models or charge your account.",
    );
  }
  return new Response(
    validatePromotionalChatStream(upstream.body, {
      onFailure: (reason) =>
        logger.warn({ offering: selected.key, reason }, '[experiential-free] invalid chat stream'),
    }),
    {
      headers: {
        ...SSE_RESPONSE_HEADERS,
        ...NO_STORE,
        'X-AGI-Resolved-Model': selected.key,
        'X-AGI-Resolved-Provider': selected.offering.provider,
        'X-AGI-Route-Lane': 'free',
      },
    },
  );
}

export const POST = withErrorHandler(handlePost);
