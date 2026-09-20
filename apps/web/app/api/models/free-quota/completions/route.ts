import 'server-only';

import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runQwenQuotaProbe, streamQwenQuotaChat } from '@agiworkforce/providers-factory';
import { getProviderOffering } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { assertAccountActive } from '@/lib/api-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { buildFreeQuotaCatalogue, isLocalQuotaRequest } from '@/lib/server/free-quota-catalogue';
import {
  claimQuotaProbe,
  PolicySchema,
  readLocalQuotaVerification,
  validateQuotaProbeAuthorization,
  hasExhaustedFreeQuota,
  markFreeQuotaExhausted,
  quotaCredentialMatches,
} from '@/lib/free-quota-authorization';
import {
  buildModelPolicyGateResponse,
  buildProviderEgressGateResponse,
} from '@/lib/managed-compute-gate';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  resolveZeroDataRetentionPolicy,
  evaluateActiveWorkspacePolicy,
} from '@/lib/services/organization-policy-gate';
import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import freePools from '@/config/free-pools.json';
import { MAX_MESSAGE_LENGTH } from '@/lib/validations/llm';
import {
  FREE_QUOTA_EXHAUSTED_CODE,
  FREE_QUOTA_EXHAUSTED_MESSAGE,
} from '@/features/models/lib/free-quota-types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RequestSchema = z.object({
  model: z.string().min(1),
  conversation_id: z.string().uuid(),
  assistant_message_id: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(MAX_MESSAGE_LENGTH),
      }),
    )
    .min(1)
    .refine(
      (messages) =>
        messages.reduce((total, message) => total + message.content.length, 0) <=
        MAX_MESSAGE_LENGTH,
    ),
  work_mode: z.literal('chat').optional(),
  web_search: z.literal(false).optional(),
  web_fetch: z.literal(false).optional(),
  research: z.literal(false).optional(),
  code_execution: z.literal(false).optional(),
  office_creation: z.literal(false).optional(),
  skill_name: z.undefined().optional(),
  mcp_context: z.undefined().optional(),
});

function refusal(message: string, code: string, status = 400) {
  return NextResponse.json({ error: { message, code } }, { status });
}

async function handlePost(request: NextRequest): Promise<Response> {
  if (!isLocalQuotaRequest(request.url, process.env.NODE_ENV)) {
    return refusal('Not found.', 'not_found', 404);
  }
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const limit = await withRateLimit(request, 'llm-completion-ip');
  if (limit) return limit;
  const scoped = await getUserScopedDb(request, { apiKeyScope: 'inference:write' });
  await assertAccountActive(scoped.userId);
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refusal(
      'Free quota testing supports text prompts in Chat mode. Turn off tools and remove attachments, then try again.',
      'free_quota_prompt_unsupported',
    );
  }
  const body = parsed.data;
  const offering = getProviderOffering(body.model);
  const inventory = buildFreeQuotaCatalogue()?.models.find((entry) => entry.key === body.model);
  if (!offering?.quotaProbeProtocol || inventory?.status !== 'account_check_required') {
    return refusal(
      'This model is not available for free-quota testing. Choose another model in Free.',
      'free_quota_unavailable',
    );
  }
  const [conversation] = await scoped.db.query<{ id: string; data_region: string | null }>(
    'select c.id, o.data_region from web_conversations c left join organizations o on o.id = c.organization_id where c.id = $1 and c.user_id = $2 and c.organization_id is not distinct from $3 and c.deleted_at is null',
    [body.conversation_id, scoped.userId, scoped.organizationId],
  );
  if (!conversation) return refusal('Conversation not found.', 'conversation_not_found', 404);
  const privacy = await evaluateActiveWorkspacePolicy(
    getNeonDb(),
    scoped.userId,
    { resource: 'privacy_mode', mode: 'byok' },
    request,
  );
  if (!privacy.allowed)
    return refusal(
      privacy.reason ?? 'Your workspace does not allow provider-key testing.',
      privacy.code ?? 'free_quota_privacy_restricted',
      403,
    );
  const modelGate = await buildModelPolicyGateResponse(scoped.userId, request, {
    provider: offering.provider,
    modelId: offering.providerModelId,
  });
  if (modelGate) return modelGate;
  const retention = await resolveZeroDataRetentionPolicy(scoped.db, scoped.userId);
  if (retention.required || conversation.data_region !== null) {
    return refusal(
      'This free-quota route does not meet your workspace’s retention or data-region policy.',
      'free_quota_workspace_restricted',
      403,
    );
  }
  const policy = PolicySchema.parse(freePools.quotaExperimentPolicy);
  const apiKey = process.env['QWEN_API_KEY'] ?? '';
  let verification: Awaited<ReturnType<typeof readLocalQuotaVerification>>;
  try {
    verification = await readLocalQuotaVerification();
    if (verification.localUserId !== scoped.userId)
      throw new Error('Quota verification belongs to a different local testing user.');
    if (
      quotaCredentialMatches(verification, apiKey) &&
      (await hasExhaustedFreeQuota(verification, body.model))
    )
      return refusal(FREE_QUOTA_EXHAUSTED_MESSAGE, FREE_QUOTA_EXHAUSTED_CODE, 409);
    validateQuotaProbeAuthorization(verification, apiKey, body.model, policy);
  } catch {
    return refusal(
      'Free-quota access needs a current account check. Verify this model’s remaining quota and “Free quota only” setting in QwenCloud before sending.',
      'free_quota_verification_required',
      409,
    );
  }
  const secrets = await applySecretHandlingToTexts(
    scoped.userId,
    body.messages.map((message) => message.content),
  );
  if (secrets.action === 'blocked') {
    return refusal(
      'Remove sensitive credentials from this conversation before sending.',
      'secrets_blocked',
      403,
    );
  }
  const messages = body.messages.map((message, index) => ({
    ...message,
    content: secrets.texts[index]!,
  }));
  const egress = await buildProviderEgressGateResponse({
    mode: 'byok',
    surface: 'web',
    userId: scoped.userId,
    routeKeyAttribution: 'user-key',
    isFallback: false,
    payload: JSON.stringify(messages),
  });
  if (egress) return egress;
  let claim: string;
  try {
    claim = await claimQuotaProbe(
      resolve(process.cwd(), '.cache/qwen-quota-experiments/turns'),
      `${scoped.userId}:${body.assistant_message_id}:${request.headers.get('Idempotency-Key') ?? 'initial'}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return refusal(
      'This free-quota request was already submitted. It will not be submitted twice.',
      'free_quota_duplicate',
      409,
    );
  }
  const saveResult = async (result: unknown) => {
    const temp = `${claim}.tmp`;
    await writeFile(
      temp,
      JSON.stringify({ offeringKey: body.model, completedAt: new Date().toISOString(), result }),
      { mode: 0o600 },
    );
    await rename(temp, claim);
  };
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'private, no-store',
    'X-AGI-Resolved-Model': body.model,
    'X-AGI-Resolved-Provider': offering.provider,
    'X-AGI-Route-Lane': 'free',
  };
  try {
    if (offering.quotaProbeProtocol === 'chat') {
      const upstream = await streamQwenQuotaChat(body.model, apiKey, policy, {
        messages,
        signal: request.signal,
      });
      if (!upstream.ok || !upstream.body) {
        const data = await upstream.json().catch(() => ({}));
        const code = data?.error?.code ?? data?.code;
        await saveResult({ status: 'failed', providerCode: code ?? upstream.status });
        if (code === 'AllocationQuota.FreeTierOnly') {
          await markFreeQuotaExhausted(verification, body.model);
          return refusal(FREE_QUOTA_EXHAUSTED_MESSAGE, FREE_QUOTA_EXHAUSTED_CODE, 409);
        }
        return refusal(
          'QwenCloud could not start this free-quota reply. No paid fallback was used.',
          'free_quota_provider_unavailable',
          503,
        );
      }
      await saveResult({ status: 'stream_started' });
      return new Response(upstream.body, { headers });
    }
    const result = await runQwenQuotaProbe(body.model, apiKey, policy, undefined, undefined, {
      messages,
      signal: request.signal,
    });
    await saveResult(result);
    if (result.status === 'quota_exhausted') {
      await markFreeQuotaExhausted(verification, body.model);
      return refusal(FREE_QUOTA_EXHAUSTED_MESSAGE, FREE_QUOTA_EXHAUSTED_CODE, 409);
    }
    if (result.status !== 'succeeded' || !result.artifactUrl) {
      return refusal(
        result.taskId
          ? `QwenCloud accepted the video request (${result.taskId}), but the result is not ready. The request has been recorded and will not be resubmitted automatically.`
          : 'QwenCloud could not complete this free-quota generation. No paid fallback was used.',
        'free_quota_generation_incomplete',
        503,
      );
    }
    const url = new URL(result.artifactUrl);
    if (url.protocol !== 'https:')
      return refusal(
        'The provider returned an unusable media link.',
        'free_quota_media_unavailable',
        502,
      );
    const content =
      offering.category === 'image'
        ? `![Generated image](<${url.href}>)`
        : `[View generated video](<${url.href}>)`;
    const chunk = JSON.stringify({
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    });
    const finish = JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    return new Response(`data: ${chunk}\n\ndata: ${finish}\n\ndata: [DONE]\n\n`, { headers });
  } catch {
    await saveResult({ status: 'submission_uncertain' });
    return refusal(
      'The free-quota request was interrupted. It has not been automatically retried or sent to a paid model.',
      'free_quota_interrupted',
      503,
    );
  }
}

export const POST = withErrorHandler(handlePost);
