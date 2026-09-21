import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { KeyValueStore } from '@agiworkforce/key-value';
import { runQwenQuotaProbe, streamQwenQuotaChat } from '@agiworkforce/providers-factory';
import { getModelMetadataById, type ProviderOffering } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { assertAccountActive } from '@/lib/api-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { moderateManagedPrompt } from '@/lib/moderation';
import { enforceManagedContentSafetyPreference } from '@/lib/services/managed-content-safety-service';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  FREE_TRIAL_MODEL,
  beginFreeTrialRequest,
  estimateConservativeFreeInputTokens,
  settleFreeTrialRequest,
  type FreeTrialReservation,
} from '@/lib/services/free-trial-service';
import type { TokenUsage } from '@/lib/services/llm-cost-calculator';
import {
  buildModelPolicyGateResponse,
  buildProviderEgressGateResponse,
} from '@/lib/managed-compute-gate';
import {
  resolveZeroDataRetentionPolicy,
  evaluateActiveWorkspacePolicy,
} from '@/lib/services/organization-policy-gate';
import { applySecretHandlingToTexts } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import { FREE_USAGE_LIMIT_REACHED_MESSAGE } from '@/app/api/llm/v1/chat/completions/lib/upstream-error-copy';
import { MAX_MESSAGE_LENGTH } from '@/lib/validations/llm';
import { loadFreePools } from '@/lib/server/free-pools';
import {
  freeQuotaContextFor,
  freeQuotaPlanAllows,
  resolveFreeQuotaDecisions,
} from '@/lib/server/free-quota-catalogue';
import {
  classifyFreeQuotaRefusal,
  claimFreeQuotaTurn,
  recordFreeQuotaHold,
  recordFreeQuotaSuspension,
  reserveFreeQuotaAllowance,
  settleFreeQuotaAllowance,
  type AllowanceReservation,
  type FreeQuotaDecision,
  type FreeQuotaPolicy,
  type FreeQuotaRefusal,
} from '@/lib/free-quota-authorization';
import { freeQuotaFailure, type FreeQuotaFailure } from '@/features/models/lib/free-quota-copy';

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
  max_tokens: z.number().int().positive().optional(),
  work_mode: z.literal('chat').optional(),
  web_search: z.literal(false).optional(),
  web_fetch: z.literal(false).optional(),
  research: z.literal(false).optional(),
  code_execution: z.literal(false).optional(),
  office_creation: z.literal(false).optional(),
  skill_name: z.undefined().optional(),
  mcp_context: z.undefined().optional(),
});

type ChatMessage = z.infer<typeof RequestSchema>['messages'][number];

const MINIMUM_REPLY_TOKENS = 256;
const THINKING_BUDGET_MULTIPLIER = 2;
const TURN_ID_LENGTH = 32;

const REFUSAL_FAILURE: Readonly<Record<FreeQuotaRefusal, FreeQuotaFailure>> = {
  exhausted: 'exhausted',
  billing: 'exhausted',
  account_billing: 'unavailable',
  busy: 'busy',
  interrupted: 'interrupted',
  too_long: 'too_long',
  failed: 'provider_failed',
};

const DECISION_FAILURE: Readonly<
  Record<Exclude<FreeQuotaDecision['status'], 'ready'>, FreeQuotaFailure>
> = {
  exhausted: 'exhausted',
  expired: 'expired',
  unavailable: 'unavailable',
};

interface CopyContext {
  issuer: string;
  modelName: string;
  alternativeName: string | null;
  expiresOn: string | null;
}

function refuse(failure: FreeQuotaFailure, context: CopyContext) {
  const body = freeQuotaFailure(failure, context);
  return NextResponse.json(
    { error: { message: body.message, code: body.code } },
    { status: body.status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

function policyRefusal(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}

function streamErrorFrame(failure: FreeQuotaFailure, context: CopyContext): string {
  const body = freeQuotaFailure(failure, context);
  return JSON.stringify({
    choices: [
      {
        index: 0,
        delta: { x_stream_error: { message: body.message, code: body.code, retryable: false } },
        finish_reason: null,
      },
    ],
  });
}

interface ProviderFailure {
  status?: number;
  code?: string;
  message?: string;
}

function readProviderFailure(data: unknown, status?: number): ProviderFailure {
  const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const nested = (
    record['error'] && typeof record['error'] === 'object' ? record['error'] : {}
  ) as Record<string, unknown>;
  const code = nested['code'] ?? record['code'];
  const message = nested['message'] ?? record['message'];
  return {
    ...(status === undefined ? {} : { status }),
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof message === 'string' ? { message } : {}),
  };
}

function readUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  const promptTokens = Number(usage['prompt_tokens'] ?? 0);
  const completionTokens = Number(usage['completion_tokens'] ?? 0);
  const reportedTotal = Number(usage['total_tokens'] ?? 0);
  if (![promptTokens, completionTokens, reportedTotal].every(Number.isFinite)) return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(reportedTotal, promptTokens + completionTokens),
  };
}

interface TurnSettlement {
  outcome: 'completed' | 'failed' | 'cancelled';
  consumedUnits: number | null;
  usage: TokenUsage | null;
  refusal: { kind: FreeQuotaRefusal; signal: string } | null;
}

interface TurnLedger {
  store: KeyValueStore;
  apiKey: string;
  offeringKey: string;
  provider: string;
  allowance: AllowanceReservation;
  reservation: FreeTrialReservation;
}

async function recordRefusal(
  ledger: Pick<TurnLedger, 'store' | 'apiKey' | 'offeringKey'>,
  refusal: { kind: FreeQuotaRefusal; signal: string },
): Promise<void> {
  const nowMs = Date.now();
  if (refusal.kind === 'exhausted' || refusal.kind === 'billing') {
    await recordFreeQuotaHold(ledger.store, {
      apiKey: ledger.apiKey,
      offeringKey: ledger.offeringKey,
      cause: refusal.kind === 'billing' ? 'billing' : 'exhausted',
      nowMs,
    });
    if (refusal.kind === 'billing') {
      logger.error(
        { offering: ledger.offeringKey, signal: refusal.signal },
        '[free-quota] provider answered a free model with a billing signal; the model is withdrawn for every account',
      );
    }
  }
  if (refusal.kind === 'account_billing') {
    await recordFreeQuotaSuspension(ledger.store, {
      apiKey: ledger.apiKey,
      signal: refusal.signal,
      nowMs,
    });
    logger.error(
      { offering: ledger.offeringKey, signal: refusal.signal },
      '[free-quota] provider reported an account billing state; every free model is withdrawn until a newer attestation',
    );
  }
}

async function settleTurn(ledger: TurnLedger, settlement: TurnSettlement): Promise<void> {
  try {
    if (settlement.refusal) await recordRefusal(ledger, settlement.refusal);
    await settleFreeQuotaAllowance(ledger.store, ledger.allowance, settlement.consumedUnits);
  } catch (error) {
    logger.error(
      { error, offering: ledger.offeringKey },
      '[free-quota] shared allowance settlement failed; the reservation stands',
    );
  }
  await settleFreeTrialRequest({
    reservation: ledger.reservation,
    outcome: settlement.outcome,
    provider: ledger.provider,
    model: ledger.offeringKey,
    ...(settlement.usage ? { usage: settlement.usage } : {}),
    measuredCostDollars: 0,
  });
}

function meteredChatStream(
  source: ReadableStream<Uint8Array>,
  ledger: TurnLedger,
  copy: CopyContext,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = source.getReader();
  let buffer = '';
  let usage: TokenUsage | null = null;
  let refusal: { kind: FreeQuotaRefusal; signal: string } | null = null;
  let finished = false;
  let settled = false;

  const settle = async (outcome: TurnSettlement['outcome']) => {
    if (settled) return;
    settled = true;
    await settleTurn(ledger, {
      outcome,
      consumedUnits: usage ? usage.totalTokens : null,
      usage,
      refusal,
    });
  };

  const rewrite = (line: string): string => {
    if (!line.startsWith('data:')) return line;
    const payload = line.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      finished = true;
      return line;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return line;
    }
    const reported = readUsage(event['usage']);
    if (reported) usage = reported;
    if (event['error'] !== undefined || typeof event['code'] === 'string') {
      const failure = readProviderFailure(event);
      const kind = classifyFreeQuotaRefusal(failure);
      refusal = { kind, signal: failure.code ?? 'stream_error' };
      return `data: ${streamErrorFrame(REFUSAL_FAILURE[kind], copy)}`;
    }
    return line;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          const tail = buffer ? `${rewrite(buffer)}\n` : '';
          const interrupted =
            !finished && !refusal
              ? `data: ${streamErrorFrame('interrupted', copy)}\n\ndata: [DONE]\n\n`
              : '';
          if (tail || interrupted) controller.enqueue(encoder.encode(tail + interrupted));
          await settle(finished && !refusal ? 'completed' : 'failed');
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        if (lines.length > 0)
          controller.enqueue(encoder.encode(`${lines.map(rewrite).join('\n')}\n`));
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${streamErrorFrame('interrupted', copy)}\n\ndata: [DONE]\n\n`),
        );
        await settle('failed');
        controller.close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      await settle('cancelled');
    },
  });
}

function turnUnits(
  offeringKey: string,
  offering: ProviderOffering,
  policy: FreeQuotaPolicy,
  messages: ChatMessage[],
  replyTokens: number,
): number {
  if (offering.quotaProbeProtocol === 'image-sync') return 1;
  if (offering.quotaProbeProtocol === 'video-async') return policy.videoSeconds;
  const multiplier = offering.quotaThinkingRequired ? THINKING_BUDGET_MULTIPLIER : 1;
  return (
    estimateConservativeFreeInputTokens({ model: offeringKey, messages }) + replyTokens * multiplier
  );
}

async function handlePost(request: NextRequest): Promise<Response> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId);
  const limit = await withRateLimit(request, 'llm-completion', `user:${scoped.userId}`);
  if (limit) return limit;

  const inventory = loadFreePools().inventory;
  const alternativeName = getModelMetadataById(FREE_TRIAL_MODEL)?.name ?? null;
  const baseCopy: CopyContext = {
    issuer: inventory?.issuer ?? 'The provider',
    modelName: 'this model',
    alternativeName,
    expiresOn: null,
  };
  if (!inventory) return refuse('unavailable', baseCopy);

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse('unsupported_prompt', baseCopy);
  const body = parsed.data;

  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  if (!freeQuotaPlanAllows(planTier)) return refuse('plan', baseCopy);

  const context = freeQuotaContextFor({ url: request.url, userId: scoped.userId });
  const decisions = await resolveFreeQuotaDecisions(context, {
    offeringKey: body.model,
    inventory,
  });
  const resolved = decisions?.offerings[0];
  if (!resolved) return refuse('unavailable', baseCopy);
  const { entry, offering, decision } = resolved;
  const copy: CopyContext = {
    ...baseCopy,
    modelName: offering.displayName,
    expiresOn: entry.expiresOn,
  };
  if (decision.status !== 'ready') {
    logger.info(
      {
        userId: scoped.userId,
        offering: body.model,
        status: decision.status,
        ...(decision.status === 'unavailable' ? { reason: decision.reason } : {}),
      },
      '[free-quota] refused before any provider request',
    );
    return refuse(DECISION_FAILURE[decision.status], copy);
  }
  const store = context.store;
  if (!store) return refuse('unavailable', copy);

  const [conversation] = await scoped.db.query<{ id: string; data_region: string | null }>(
    'select c.id, o.data_region from web_conversations c left join organizations o on o.id = c.organization_id where c.id = $1 and c.user_id = $2 and c.organization_id is not distinct from $3 and c.deleted_at is null',
    [body.conversation_id, scoped.userId, scoped.organizationId],
  );
  if (!conversation) return policyRefusal('Conversation not found.', 'conversation_not_found', 404);

  const privacy = await evaluateActiveWorkspacePolicy(
    scoped.db,
    scoped.userId,
    { resource: 'privacy_mode', mode: 'managed' },
    request,
  );
  if (!privacy.allowed) {
    return privacy.reason
      ? policyRefusal(privacy.reason, privacy.code ?? 'organization_policy', 403)
      : refuse('workspace_restricted', copy);
  }
  const modelGate = await buildModelPolicyGateResponse(scoped.userId, request, {
    provider: offering.provider,
    modelId: offering.providerModelId,
  });
  if (modelGate) return modelGate;
  const retention = await resolveZeroDataRetentionPolicy(scoped.db, scoped.userId);
  if (retention.required || conversation.data_region !== null) {
    return refuse('workspace_restricted', copy);
  }

  const texts = body.messages.map((message) => message.content);
  const moderation = moderateManagedPrompt({
    userId: scoped.userId,
    segments: texts.filter((text) => text.length > 0),
  });
  if (!moderation.allowed) {
    return policyRefusal(moderation.refusal, 'content_policy_violation', 422);
  }
  const latestUserPrompt = body.messages.findLast((message) => message.role === 'user')?.content;
  try {
    const safety = await enforceManagedContentSafetyPreference(scoped.db, {
      userId: scoped.userId,
      prompt: latestUserPrompt ?? '',
    });
    if (!safety.allowed) return policyRefusal(safety.refusal, 'reduce_sensitive_content', 422);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, '[free-quota] content safety preference unread');
    return policyRefusal(
      'Your content safety preference could not be verified. No model request was sent.',
      'content_safety_preference_unavailable',
      503,
    );
  }

  const secrets = await applySecretHandlingToTexts(scoped.userId, texts);
  if (secrets.action === 'blocked') {
    return policyRefusal(
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
    mode: 'managed',
    surface: 'web',
    userId: scoped.userId,
    routeKeyAttribution: 'platform-key',
    isFallback: false,
    payload: JSON.stringify(messages),
  });
  if (egress) return egress;

  const turnId = createHash('sha256')
    .update(`${body.assistant_message_id}\n${request.headers.get('Idempotency-Key') ?? 'send'}`)
    .digest('hex')
    .slice(0, TURN_ID_LENGTH);
  const nowMs = Date.now();
  const claimed = await claimFreeQuotaTurn(store, {
    userId: scoped.userId,
    requestId: turnId,
    nowMs,
  }).catch((error: unknown) => {
    logger.error({ error, offering: entry.offeringKey }, '[free-quota] turn claim unwritable');
    return null;
  });
  if (claimed === null) return refuse('unavailable', copy);
  if (!claimed) return refuse('duplicate', copy);

  const trial = await beginFreeTrialRequest({
    userId: scoped.userId,
    requestId: `free-quota:${turnId}`,
  });
  if (!trial.ok) {
    return NextResponse.json(
      {
        error: {
          message: FREE_USAGE_LIMIT_REACHED_MESSAGE,
          type: 'insufficient_quota',
          code: 'free_trial_token_budget_reached',
        },
      },
      { status: 429 },
    );
  }

  const { policy } = context;
  const multiplier = offering.quotaThinkingRequired ? THINKING_BUDGET_MULTIPLIER : 1;
  const inputUnits = turnUnits(entry.offeringKey, offering, policy, messages, 0);
  const remainingUnits = decision.usable - decision.used;
  const replyTokens = Math.min(
    policy.chatMaxOutputTokens,
    body.max_tokens ?? policy.chatMaxOutputTokens,
    Math.floor((remainingUnits - inputUnits) / multiplier),
  );
  if (offering.quotaProbeProtocol === 'chat' && replyTokens < MINIMUM_REPLY_TOKENS) {
    await settleFreeTrialRequest({ reservation: trial.reservation, outcome: 'failed' });
    return refuse('too_long', copy);
  }
  let allowance: AllowanceReservation | null;
  try {
    allowance = await reserveFreeQuotaAllowance(store, {
      apiKey: context.apiKey,
      observedOn: inventory.observedOn,
      offeringKey: entry.offeringKey,
      expiresOn: entry.expiresOn,
      units: turnUnits(entry.offeringKey, offering, policy, messages, replyTokens),
      usable: decision.usable,
      nowMs,
    });
  } catch (error) {
    logger.error({ error, offering: entry.offeringKey }, '[free-quota] allowance meter unwritable');
    await settleFreeTrialRequest({ reservation: trial.reservation, outcome: 'failed' });
    return refuse('unavailable', copy);
  }
  if (!allowance) {
    await settleFreeTrialRequest({ reservation: trial.reservation, outcome: 'failed' });
    return refuse('exhausted', copy);
  }

  const ledger: TurnLedger = {
    store,
    apiKey: context.apiKey,
    offeringKey: entry.offeringKey,
    provider: offering.provider,
    allowance,
    reservation: trial.reservation,
  };
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'private, no-store',
    'X-AGI-Resolved-Model': entry.offeringKey,
    'X-AGI-Resolved-Provider': offering.provider,
    'X-AGI-Route-Lane': 'free',
  };

  if (offering.quotaProbeProtocol === 'chat') {
    let upstream: Response;
    try {
      upstream = await streamQwenQuotaChat(
        entry.offeringKey,
        context.apiKey,
        {
          ...policy,
          maxOutputTokens: replyTokens,
          requestTimeoutMs: policy.chatRequestTimeoutMs,
        },
        { messages, signal: request.signal },
      );
    } catch {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: null,
        usage: null,
        refusal: null,
      });
      return refuse('interrupted', copy);
    }
    if (!upstream.ok || !upstream.body) {
      const failure = readProviderFailure(await upstream.json().catch(() => null), upstream.status);
      const kind = classifyFreeQuotaRefusal(failure);
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: 0,
        usage: null,
        refusal: { kind, signal: failure.code ?? `http_${upstream.status}` },
      });
      return refuse(REFUSAL_FAILURE[kind], copy);
    }
    return new Response(meteredChatStream(upstream.body, ledger, copy), { headers });
  }

  try {
    const result = await runQwenQuotaProbe(
      entry.offeringKey,
      context.apiKey,
      policy,
      undefined,
      undefined,
      { messages, signal: request.signal },
    );
    if (result.status === 'quota_exhausted' || result.status === 'failed') {
      const kind =
        result.status === 'quota_exhausted'
          ? 'exhausted'
          : classifyFreeQuotaRefusal({
              ...(result.providerCode ? { code: result.providerCode } : {}),
            });
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: 0,
        usage: null,
        refusal: { kind, signal: result.providerCode ?? 'generation_failed' },
      });
      return refuse(REFUSAL_FAILURE[kind], copy);
    }
    const artifact = result.artifactUrl ? new URL(result.artifactUrl) : null;
    if (result.status !== 'succeeded' || artifact?.protocol !== 'https:') {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: null,
        usage: null,
        refusal: null,
      });
      return refuse(result.status === 'submitted' ? 'interrupted' : 'provider_failed', copy);
    }
    await settleTurn(ledger, {
      outcome: 'completed',
      consumedUnits: allowance.units,
      usage: null,
      refusal: null,
    });
    const content =
      offering.category === 'image'
        ? `![Generated image](<${artifact.href}>)`
        : `[View generated video](<${artifact.href}>)`;
    const chunk = JSON.stringify({
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    });
    const finish = JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    return new Response(`data: ${chunk}\n\ndata: ${finish}\n\ndata: [DONE]\n\n`, { headers });
  } catch {
    await settleTurn(ledger, {
      outcome: 'failed',
      consumedUnits: null,
      usage: null,
      refusal: null,
    });
    return refuse('interrupted', copy);
  }
}

export const POST = withErrorHandler(handlePost);
