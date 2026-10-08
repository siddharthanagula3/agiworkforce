import 'server-only';

import { createHash } from 'node:crypto';
import { NextResponse, after, type NextRequest } from 'next/server';
import type { KeyValueStore } from '@agiworkforce/key-value';
import { stripSystemPromptCacheBoundary } from '@agiworkforce/provider-protocol';
import { runQwenQuotaProbe, streamQwenQuotaChat } from '@agiworkforce/providers-factory';
import {
  freeOfferingContentText,
  type FreeLimit,
  type FreeLimitReason,
  type FreeOfferingMessage,
  type FreeOfferingRequest,
} from '@agiworkforce/cloud-contracts';
import {
  getModelMetadataById,
  getProviderOffering,
  getProviderOfferingMediaRequestUnits,
  getProviderOfferingQuotaUnit,
  MANAGED_MEMORY_CITATIONS_HEADER,
  type ProviderOffering,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { persistFreeOfferingUser } from '@/lib/server/persist-free-offering-user';
import { resolveFreeOfferingPersonalContext } from '@/lib/services/turn-context-service';
import { freeQuotaSystemMessages } from '@/lib/server/free-quota-system-messages';
import type { UserScopedDb } from '@/lib/server/rls-db';
import { toMemoryCitationsHeaderValue } from '@/lib/chat-project-sources';
import { moderateGeneratedMedia, moderateManagedPrompt } from '@/lib/moderation';
import { enforceManagedContentSafetyPreference } from '@/lib/services/managed-content-safety-service';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  FREE_TRIAL_MODEL,
  estimateConservativeFreeInputTokens,
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
import {
  freeOfferingRequiresCodeExecution,
  freeOfferingRequiresWebAccess,
} from '@/features/models/lib/free-offering-request';
import { loadFreePools, type FreeQuotaInventory } from '@/lib/server/free-pools';
import {
  freeQuotaContextFor,
  freeQuotaPlanAdmission,
  resolveFreeQuotaAlternative,
  resolveFreeQuotaDecisions,
} from '@/lib/server/free-quota-catalogue';
import { expireFreeQuotaCatalogue } from '@/lib/server/free-quota-catalogue-cache';
import {
  classifyFreeQuotaRefusal,
  claimFreeQuotaTurn,
  freeQuotaDayResetsAtMs,
  freeQuotaEndsOn,
  readFreeQuotaDailyUse,
  recordFreeQuotaHold,
  recordFreeQuotaSuspension,
  releaseFreeQuotaDailyUse,
  reserveFreeQuotaAllowance,
  reserveFreeQuotaDailyUse,
  settleFreeQuotaAllowance,
  type AllowanceReservation,
  type DailyUseReservation,
  type FreeQuotaDecision,
  type FreeQuotaHoldCause,
  type FreeQuotaPolicy,
  type FreeQuotaRefusal,
} from '@/lib/free-quota-authorization';
import {
  freeQuotaFailure,
  type FreeQuotaFailure,
  type FreeQuotaFailureContext,
} from '@/features/models/lib/free-quota-copy';
import { bytesFromUrl } from '@/lib/server/media-storage';
import { persistGeneratedFileBytes } from '@/lib/server/generated-file-persist';
import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';
import { SSE_RESPONSE_HEADERS } from '@/app/api/llm/v1/chat/completions/lib/sse-heartbeat';
import { buildCapabilityPreamble } from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';
import { validatePromotionalChatStream } from '@/features/models/lib/promotional-chat-stream';
import { persistAssistantTurn } from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import { freeModelLabel } from '@/features/chat/lib/freeLimitRecovery';
import {
  ChatAttachmentHydrationError,
  hydrateChatAttachments,
} from '@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';

type ChatMessage = FreeOfferingMessage;
type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'file'; file: { asset_id: string } }
  | { type: 'image_url'; image_url: { url: string } };
type PreparedChatMessage = {
  role: ChatMessage['role'];
  content: string | ChatPart[];
};

const MINIMUM_REPLY_TOKENS = 256;
const THINKING_BUDGET_MULTIPLIER = 2;
const TURN_ID_LENGTH = 32;

const FREE_MEDIA_EXTENSION: Readonly<Record<string, string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const REFUSAL_FAILURE: Readonly<Record<FreeQuotaRefusal, FreeQuotaFailure>> = {
  exhausted: 'exhausted',
  billing: 'exhausted',
  account_billing: 'unavailable',
  busy: 'busy',
  interrupted: 'interrupted',
  too_long: 'too_long',
  unavailable: 'unavailable',
  refused: 'unavailable',
  withdrawn: 'expired',
  blocked: 'blocked',
  failed: 'provider_failed',
};

const DECISION_FAILURE: Readonly<
  Record<Exclude<FreeQuotaDecision['status'], 'ready'>, FreeQuotaFailure>
> = {
  exhausted: 'exhausted',
  expired: 'expired',
  unavailable: 'unavailable',
};

const HOLD_BY_REFUSAL: Readonly<Partial<Record<FreeQuotaRefusal, FreeQuotaHoldCause>>> = {
  exhausted: 'exhausted',
  billing: 'billing',
  withdrawn: 'withdrawn',
  refused: 'refused',
};

const FREE_LIMIT_REASON: Readonly<Partial<Record<FreeQuotaFailure, FreeLimitReason>>> = {
  exhausted: 'allowance_used',
  expired: 'allowance_ended',
};

function withdrawsOffering(kind: FreeQuotaRefusal): boolean {
  return HOLD_BY_REFUSAL[kind] !== undefined || kind === 'account_billing';
}

function generatedNothing(kind: FreeQuotaRefusal): boolean {
  return withdrawsOffering(kind) || kind === 'busy';
}

type CopyContext = FreeQuotaFailureContext;

function refuse(failure: FreeQuotaFailure, context: CopyContext, freeLimit?: FreeLimit) {
  const body = freeQuotaFailure(failure, context);
  return NextResponse.json(
    {
      error: {
        message: body.message,
        code: body.code,
        ...(freeLimit ? { free_limit: freeLimit } : {}),
      },
    },
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
  const promptTokens = usage['prompt_tokens'];
  const completionTokens = usage['completion_tokens'];
  const reportedTotal = usage['total_tokens'];
  const validCount = (count: unknown): count is number =>
    typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  if (
    !validCount(promptTokens) ||
    !validCount(completionTokens) ||
    !Number.isSafeInteger(promptTokens + completionTokens) ||
    promptTokens + completionTokens === 0 ||
    (reportedTotal !== undefined && !validCount(reportedTotal))
  )
    return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(reportedTotal ?? 0, promptTokens + completionTokens),
  };
}

function normalizedMediaType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
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
  allowance: AllowanceReservation;
  expireCatalogue: () => void;
}

function expireCatalogueNow(): void {
  try {
    expireFreeQuotaCatalogue();
  } catch (error) {
    logger.warn(
      { error },
      '[free-quota] the cached catalogue could not be expired; a held model stays listed until the cache ages',
    );
  }
}

interface DeferredCatalogueExpiry {
  expireCatalogue: () => void;
  turnSettled: () => void;
}

// Next applies a tag expiry once, when the route handler returns. One requested
// while the response body streams is queued and never applied, so it waits for
// after(), which runs its own revalidation pass once the response has closed. A
// reader who leaves closes the response before the stream has settled, so the
// task waits for the settlement that decides whether an expiry is due.
function expireCatalogueAfterResponse(): DeferredCatalogueExpiry {
  let due = false;
  let turnSettled = (): void => undefined;
  const settlement = new Promise<void>((resolve) => {
    turnSettled = resolve;
  });
  try {
    after(async () => {
      await settlement;
      if (due) expireCatalogueNow();
    });
  } catch {
    return { expireCatalogue: expireCatalogueNow, turnSettled };
  }
  return {
    expireCatalogue: () => {
      due = true;
    },
    turnSettled,
  };
}

async function recordRefusal(
  ledger: Omit<TurnLedger, 'allowance'>,
  refusal: { kind: FreeQuotaRefusal; signal: string },
): Promise<void> {
  const nowMs = Date.now();
  const cause = HOLD_BY_REFUSAL[refusal.kind];
  if (cause) {
    await recordFreeQuotaHold(ledger.store, {
      apiKey: ledger.apiKey,
      offeringKey: ledger.offeringKey,
      cause,
      nowMs,
    });
    ledger.expireCatalogue();
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
    ledger.expireCatalogue();
    logger.error(
      { offering: ledger.offeringKey, signal: refusal.signal },
      '[free-quota] provider reported an account billing state; every free model is withdrawn until a newer attestation',
    );
  }
  if (refusal.kind === 'refused') {
    logger.warn(
      { offering: ledger.offeringKey, signal: refusal.signal },
      '[free-quota] provider refused this free model; it is withheld for every account until a newer attestation',
    );
  }
  if (refusal.kind === 'unavailable') {
    logger.warn(
      { offering: ledger.offeringKey, signal: refusal.signal },
      '[free-quota] provider refused this free model for one turn; it stays on offer',
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
}

function meteredChatStream(
  source: ReadableStream<Uint8Array>,
  ledger: TurnLedger,
  copy: CopyContext,
  turnSettled: () => void,
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
    try {
      await settleTurn(ledger, {
        outcome,
        consumedUnits: usage ? usage.totalTokens : null,
        usage,
        refusal,
      });
    } finally {
      turnSettled();
    }
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
    if (Object.prototype.hasOwnProperty.call(event, 'usage')) {
      const reported = readUsage(event['usage']);
      usage = reported && usage && reported.totalTokens < usage.totalTokens ? usage : reported;
    }
    const choices = event['choices'];
    if (
      Array.isArray(choices) &&
      choices.some((choice: unknown) => {
        if (!choice || typeof choice !== 'object') return false;
        const delta = (choice as { delta?: unknown }).delta;
        return (
          delta !== null &&
          typeof delta === 'object' &&
          (delta as { x_stream_error?: unknown }).x_stream_error !== undefined
        );
      })
    ) {
      refusal = { kind: 'failed', signal: 'untrusted_stream_error' };
      return `data: ${streamErrorFrame('provider_failed', copy)}`;
    }
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
      await settle(finished && !refusal ? 'completed' : 'cancelled');
    },
  });
}

interface RecordedAnswer {
  content: string;
  usage: TokenUsage | null;
  complete: boolean;
}

function recordedAnswerStream(
  source: ReadableStream<Uint8Array>,
  record: (answer: RecordedAnswer) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let usage: TokenUsage | null = null;
  let failed = false;
  let recorded = false;

  const read = (text: string): boolean => {
    const lines = (pending + text).split('\n');
    pending = lines.pop() ?? '';
    let finished = false;
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice('data:'.length).trim();
      if (payload === '[DONE]') {
        finished = true;
        continue;
      }
      let event: { usage?: unknown; choices?: unknown };
      try {
        event = JSON.parse(payload) as { usage?: unknown; choices?: unknown };
      } catch {
        continue;
      }
      usage = readUsage(event.usage) ?? usage;
      for (const choice of Array.isArray(event.choices) ? event.choices : []) {
        const delta = (choice as { delta?: { content?: unknown; x_stream_error?: unknown } } | null)
          ?.delta;
        if (typeof delta?.content === 'string') content += delta.content;
        if (delta?.x_stream_error !== undefined) failed = true;
      }
    }
    return finished;
  };

  const settle = async (complete: boolean) => {
    if (recorded) return;
    recorded = true;
    if (!content.trim()) return;
    await record({ content, usage, complete }).catch((error: unknown) => {
      logger.error({ error }, '[free-quota] the Free Auto answer could not be saved on the server');
    });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await settle(false);
          controller.close();
          return;
        }
        if (read(decoder.decode(value, { stream: true }))) await settle(!failed);
        controller.enqueue(value);
      } catch (error) {
        await settle(false);
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      await settle(false);
    },
  });
}

function turnUnits(
  offeringKey: string,
  offering: ProviderOffering,
  policy: FreeQuotaPolicy,
  messages: PreparedChatMessage[],
  replyTokens: number,
): number {
  const mediaUnits = getProviderOfferingMediaRequestUnits(offering, policy.videoSeconds);
  if (mediaUnits !== null) return mediaUnits;
  const multiplier = offering.quotaThinkingRequired ? THINKING_BUDGET_MULTIPLIER : 1;
  const imageCount = messages.reduce(
    (total, message) =>
      total +
      (typeof message.content === 'string'
        ? 0
        : message.content.filter((part) => part.type === 'image_url').length),
    0,
  );
  return (
    estimateConservativeFreeInputTokens({
      model: offeringKey,
      messages: messages.map((message) => ({
        role: message.role,
        content: freeOfferingContentText(message.content),
      })),
    }) +
    imageCount * policy.chatImageReserveTokens +
    replyTokens * multiplier
  );
}

function baseCopyFor(inventory: FreeQuotaInventory | undefined): CopyContext {
  return {
    issuer: inventory?.issuer ?? 'The provider',
    modelName: 'this model',
    alternativeName: getModelMetadataById(FREE_TRIAL_MODEL)?.name ?? null,
    expiresOn: null,
  };
}

export function refuseUnsupportedFreeQuotaPrompt(): Response {
  return refuse('unsupported_prompt', baseCopyFor(loadFreePools().inventory));
}

export interface FreeAutoTurn {
  requestId: string;
  requestedModel: string;
  fallbackReason?: string;
  assistantParentId?: string;
  providerRequestSignal?: () => AbortSignal;
}

export async function serveFreeQuotaTurn(
  request: NextRequest,
  scoped: UserScopedDb,
  body: FreeOfferingRequest,
  freeAuto?: FreeAutoTurn,
): Promise<Response> {
  const { inventory, limitedMediaOffer } = loadFreePools();
  const baseCopy = baseCopyFor(inventory);
  if (!inventory) return refuse('unavailable', baseCopy);
  if (freeOfferingRequiresWebAccess(body)) {
    return policyRefusal(
      'This promotional model cannot search the web or open pages in Chat. Choose a search-capable Free model, such as Free Auto, and send your request again. No model request was sent.',
      'free_quota_search_unsupported',
      400,
    );
  }
  if (
    getProviderOffering(body.model)?.quotaProbeProtocol === 'chat' &&
    freeOfferingRequiresCodeExecution(body)
  ) {
    return policyRefusal(
      'This promotional model cannot run code in the sandbox. Choose Free Auto and send your request again. No model request was sent.',
      'free_quota_code_unsupported',
      400,
    );
  }

  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  const context = freeQuotaContextFor({ url: request.url, userId: scoped.userId });
  const decisions = await resolveFreeQuotaDecisions(context, {
    offeringKey: body.model,
    inventory,
  });
  const resolved = decisions?.offerings[0];
  if (!resolved) return refuse('unavailable', baseCopy);
  const { entry, offering, decision } = resolved;
  const admission = freeQuotaPlanAdmission(planTier, offering.category, limitedMediaOffer);
  if (!admission) return refuse('plan', baseCopy);
  const latestUserIndex = body.messages.findLastIndex((message) => message.role === 'user');
  const hasAttachmentReferences = body.messages.some(
    (message) =>
      typeof message.content !== 'string' && message.content.some((part) => part.type === 'file'),
  );
  if (
    hasAttachmentReferences &&
    (!offering.quotaChatImageInput ||
      body.messages.some(
        (message, index) =>
          index !== latestUserIndex &&
          typeof message.content !== 'string' &&
          message.content.some((part) => part.type === 'file'),
      ))
  ) {
    return policyRefusal(
      'This free model cannot read the attached image. Choose an image-capable Free model or remove the attachment. No model request was sent.',
      'free_quota_image_unsupported',
      400,
    );
  }
  const endsOn = freeQuotaEndsOn(entry, offering);
  const today = new Date(context.nowMs).toISOString().slice(0, 10);
  const copy: CopyContext = {
    ...baseCopy,
    modelName: offering.displayName,
    expiresOn: endsOn !== null && endsOn <= today ? endsOn : null,
  };
  const refuseTurn = async (failure: FreeQuotaFailure) => {
    const reason = FREE_LIMIT_REASON[failure];
    if (!reason) return refuse(failure, copy);
    const alternative =
      (await resolveFreeQuotaAlternative(context, {
        inventory,
        refusedKey: entry.offeringKey,
        needsImageInput: hasAttachmentReferences,
      })) ??
      (offering.quotaProbeProtocol === 'chat' && !hasAttachmentReferences
        ? FREE_TRIAL_MODEL
        : null);
    const alternativeName = alternative ? freeModelLabel(alternative) : null;
    return refuse(
      failure,
      { ...copy, alternativeName },
      {
        model: entry.offeringKey,
        reason,
        ...(alternative && alternativeName ? { alternative_model: alternative } : {}),
      },
    );
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
    return refuseTurn(DECISION_FAILURE[decision.status]);
  }
  const store = context.store;
  if (!store) return refuse('unavailable', copy);

  const dailyLimit =
    admission.terms === 'limited'
      ? { userId: scoped.userId, category: admission.category, cap: admission.dailyCap }
      : null;
  const refuseDailyLimit = ({ category, cap }: NonNullable<typeof dailyLimit>) => {
    const resetsAtMs = freeQuotaDayResetsAtMs(context.nowMs);
    logger.info(
      { userId: scoped.userId, offering: entry.offeringKey, category },
      '[free-quota] daily free limit reached; refused before any provider request',
    );
    return refuse(
      'daily_limit',
      { ...copy, alternativeName: null, dailyLimit: { category, cap, resetsAtMs } },
      {
        model: entry.offeringKey,
        reason: 'daily_limit_reached',
        resets_at: new Date(resetsAtMs).toISOString(),
      },
    );
  };
  if (dailyLimit) {
    let usedToday: number;
    try {
      usedToday = await readFreeQuotaDailyUse(store, { ...dailyLimit, nowMs: context.nowMs });
    } catch (error) {
      logger.error({ error, offering: entry.offeringKey }, '[free-quota] daily use unreadable');
      return refuse('unavailable', copy);
    }
    if (usedToday >= dailyLimit.cap) return refuseDailyLimit(dailyLimit);
  }

  const [conversation] = await scoped.db.query<{
    id: string;
    data_region: string | null;
    project_id: string | null;
    is_temporary: boolean | null;
  }>(
    'select c.id, o.data_region, c.project_id, c.is_temporary from web_conversations c left join organizations o on o.id = c.organization_id where c.id = $1 and c.user_id = $2 and c.organization_id is not distinct from $3 and c.deleted_at is null',
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

  const texts = body.messages.map((message) => freeOfferingContentText(message.content));
  const moderation = moderateManagedPrompt({
    userId: scoped.userId,
    segments: texts.filter((text) => text.length > 0),
  });
  if (!moderation.allowed) {
    return policyRefusal(moderation.refusal, 'content_policy_violation', 422);
  }
  const latestUserPrompt = body.messages.findLast((message) => message.role === 'user');
  try {
    const safety = await enforceManagedContentSafetyPreference(scoped.db, {
      userId: scoped.userId,
      prompt: latestUserPrompt ? freeOfferingContentText(latestUserPrompt.content) : '',
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
  const messages: PreparedChatMessage[] = body.messages.map((message, index) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? secrets.texts[index]!
        : [
            ...(secrets.texts[index]
              ? [{ type: 'text' as const, text: secrets.texts[index]! }]
              : []),
            ...message.content.filter((part) => part.type === 'file'),
          ],
  }));
  if (hasAttachmentReferences) {
    try {
      const hydrated = await hydrateChatAttachments(messages, scoped.userId);
      const expected = body.messages.reduce(
        (count, message) =>
          count +
          (typeof message.content === 'string'
            ? 0
            : message.content.filter((part) => part.type === 'file').length),
        0,
      );
      if (
        hydrated.length !== expected ||
        hydrated.some((file) => !isChatImageMimeType(file.mimeType))
      ) {
        return policyRefusal(
          'This free model accepts images, but not this file type. Remove the file or use Free Auto. No model request was sent.',
          'free_quota_file_unsupported',
          400,
        );
      }
    } catch (error) {
      if (error instanceof ChatAttachmentHydrationError) {
        return policyRefusal(error.message, error.code, error.status);
      }
      logger.error({ error, userId: scoped.userId }, '[free-quota] image hydration failed');
      return policyRefusal(
        'Your image could not be loaded. Attach it again and retry. No model request was sent.',
        'free_quota_image_unavailable',
        503,
      );
    }
    if (
      messages.some(
        (message) =>
          typeof message.content !== 'string' &&
          message.content.some((part) => part.type !== 'text' && part.type !== 'image_url'),
      )
    ) {
      return policyRefusal(
        'This free model accepts images, but not this file type. Remove the file or use Free Auto. No model request was sent.',
        'free_quota_file_unsupported',
        400,
      );
    }
  }
  const turnId = createHash('sha256')
    .update(`${body.assistant_message_id}\n${request.headers.get('Idempotency-Key') ?? 'send'}`)
    .digest('hex')
    .slice(0, TURN_ID_LENGTH);
  let memoryCitationsHeader: string | null = null;
  if (offering.quotaProbeProtocol === 'chat') {
    const personalContext = await resolveFreeOfferingPersonalContext(scoped.db, {
      turnId,
      userId: scoped.userId,
      organizationId: scoped.organizationId,
      projectId: conversation.project_id,
      conversationId: body.conversation_id,
      temporaryChat: conversation.is_temporary === true,
      memoryEnabled: body.memory_enabled,
      personalization: body.personalization,
      query: latestUserPrompt ? freeOfferingContentText(latestUserPrompt.content) : '',
    });
    const preamble = buildCapabilityPreamble({
      tools: [],
      ...(body.client_timezone ? { timeZone: body.client_timezone } : {}),
    });
    messages.unshift(
      ...freeQuotaSystemMessages({
        preamble: preamble ? stripSystemPromptCacheBoundary(preamble) : '',
        personal: personalContext.blocks,
      }),
    );
    memoryCitationsHeader = toMemoryCitationsHeaderValue(personalContext.memoryCitations);
  }

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

  let dailyUse: DailyUseReservation | null = null;
  if (dailyLimit) {
    try {
      dailyUse = await reserveFreeQuotaDailyUse(store, { ...dailyLimit, nowMs: context.nowMs });
    } catch (error) {
      logger.error({ error, offering: entry.offeringKey }, '[free-quota] daily use unwritable');
      return refuse('unavailable', copy);
    }
    if (!dailyUse) return refuseDailyLimit(dailyLimit);
  }
  const releaseDailyUse = async () => {
    if (!dailyUse) return;
    try {
      await releaseFreeQuotaDailyUse(store, dailyUse);
    } catch (error) {
      logger.error(
        { error, offering: entry.offeringKey },
        '[free-quota] daily use could not be given back; the count stands',
      );
    }
  };

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
    await releaseDailyUse();
    return refuse('too_long', copy);
  }
  let allowance: AllowanceReservation | null;
  try {
    allowance = await reserveFreeQuotaAllowance(store, {
      apiKey: context.apiKey,
      observedOn: inventory.observedOn,
      offeringKey: entry.offeringKey,
      expiresOn: endsOn,
      units: turnUnits(entry.offeringKey, offering, policy, messages, replyTokens),
      usable: decision.usable,
      nowMs,
    });
  } catch (error) {
    logger.error({ error, offering: entry.offeringKey }, '[free-quota] allowance meter unwritable');
    await releaseDailyUse();
    return refuse('unavailable', copy);
  }
  if (!allowance) {
    await releaseDailyUse();
    return refuseTurn('exhausted');
  }

  const ledger: TurnLedger = {
    store,
    apiKey: context.apiKey,
    offeringKey: entry.offeringKey,
    allowance,
    expireCatalogue: expireCatalogueNow,
  };
  const headers = {
    ...SSE_RESPONSE_HEADERS,
    'Cache-Control': 'private, no-store',
    'X-AGI-Resolved-Model': entry.offeringKey,
    'X-AGI-Resolved-Provider': offering.provider,
    'X-AGI-Route-Lane': 'free',
    ...(memoryCitationsHeader ? { [MANAGED_MEMORY_CITATIONS_HEADER]: memoryCitationsHeader } : {}),
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
        {
          messages: messages.map((message) => ({
            role: message.role,
            content:
              typeof message.content === 'string'
                ? message.content
                : message.content.map((part) => {
                    if (part.type === 'file') throw new Error('Unhydrated image reference');
                    return part;
                  }),
          })),
          signal: freeAuto?.providerRequestSignal
            ? AbortSignal.any([request.signal, freeAuto.providerRequestSignal()])
            : request.signal,
        },
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
      return refuseTurn(REFUSAL_FAILURE[kind]);
    }
    const expiry = expireCatalogueAfterResponse();
    const answer = validatePromotionalChatStream(
      meteredChatStream(
        upstream.body,
        { ...ledger, expireCatalogue: expiry.expireCatalogue },
        copy,
        expiry.turnSettled,
      ),
      {
        trustedErrorFrames: true,
        onFailure: (reason) =>
          logger.warn({ offering: entry.offeringKey, reason }, '[free-quota] invalid chat stream'),
      },
    );
    return new Response(
      freeAuto && conversation.is_temporary !== true
        ? recordedAnswerStream(answer, ({ content, usage, complete }) =>
            persistAssistantTurn({
              processed: {
                requestId: freeAuto.requestId,
                conversationId: body.conversation_id,
                assistantMessageId: body.assistant_message_id,
                ...(freeAuto.assistantParentId
                  ? { assistantParentId: freeAuto.assistantParentId }
                  : {}),
                organizationId: scoped.organizationId,
                conversationIsTemporary: false,
                requestedModel: freeAuto.requestedModel,
                usedFallback: freeAuto.fallbackReason !== undefined,
                fallbackReason: freeAuto.fallbackReason,
                routeLane: 'free',
              },
              userId: scoped.userId,
              snapshot: {
                content,
                model: entry.offeringKey,
                provider: offering.provider,
                inputTokens: usage?.promptTokens ?? 0,
                outputTokens: usage?.completionTokens ?? 0,
                truncated: !complete,
                ...(freeAuto.fallbackReason ? { fallbackReason: freeAuto.fallbackReason } : {}),
              },
            }),
          )
        : answer,
      { headers },
    );
  }

  let consumedMediaUnits: number | null = null;
  try {
    const result = await runQwenQuotaProbe(
      entry.offeringKey,
      context.apiKey,
      policy,
      undefined,
      undefined,
      {
        messages: messages.map((message) => ({
          role: message.role,
          content: freeOfferingContentText(message.content),
        })),
        signal: request.signal,
      },
    );
    if (result.status === 'quota_exhausted' || result.status === 'failed') {
      const kind =
        result.status === 'quota_exhausted'
          ? 'exhausted'
          : classifyFreeQuotaRefusal({
              ...(result.providerStatus === undefined ? {} : { status: result.providerStatus }),
              ...(result.providerCode ? { code: result.providerCode } : {}),
              ...(result.providerMessage ? { message: result.providerMessage } : {}),
            });
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: 0,
        usage: null,
        refusal: { kind, signal: result.providerCode ?? 'generation_failed' },
      });
      if (generatedNothing(kind)) await releaseDailyUse();
      return refuseTurn(REFUSAL_FAILURE[kind]);
    }
    const artifact = result.artifactUrl ? new URL(result.artifactUrl) : null;
    if (result.status !== 'succeeded' || artifact?.protocol !== 'https:') {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: null,
        usage: null,
        refusal: null,
      });
      logger.warn(
        {
          offering: entry.offeringKey,
          status: result.status,
          ...(result.providerCode ? { signal: result.providerCode } : {}),
        },
        '[free-quota] media generation returned no usable artifact; the reservation stands',
      );
      return refuse(result.status === 'submitted' ? 'interrupted' : 'provider_failed', copy);
    }
    const reportedSeconds =
      getProviderOfferingQuotaUnit(offering) === 'seconds' ? result.consumedSeconds : undefined;
    consumedMediaUnits =
      reportedSeconds === undefined ? allowance.units : Math.ceil(reportedSeconds);
    if (consumedMediaUnits > allowance.units) {
      logger.warn(
        {
          offering: entry.offeringKey,
          consumedSeconds: reportedSeconds,
          clipSeconds: allowance.units,
        },
        '[free-quota] the provider consumed more seconds than the catalogued clip length',
      );
    }
    const generated = await bytesFromUrl(artifact.href);
    const mimeType = normalizedMediaType(generated.contentType);
    const mediaKind = offering.category === 'image' ? 'image' : 'video';
    if (!mimeType.startsWith(`${mediaKind}/`)) {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: consumedMediaUnits,
        usage: null,
        refusal: null,
      });
      return refuse('provider_failed', copy);
    }
    const moderation = await moderateGeneratedMedia({
      userId: scoped.userId,
      media: mediaKind,
      operation: 'free_quota_generation',
      bytes: generated.data,
      mimeType,
      prompt: latestUserPrompt ? freeOfferingContentText(latestUserPrompt.content) : undefined,
      signal: request.signal,
    });
    if (!moderation.allowed) {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: consumedMediaUnits,
        usage: null,
        refusal: null,
      });
      return policyRefusal(moderation.refusal, 'content_policy_violation', 422);
    }
    const generatedAt = new Date().toISOString();
    const provenance = buildAiGeneratedProvenance({
      kind: mediaKind,
      provider: offering.provider,
      model: entry.offeringKey,
      generatedAt,
      contentHashSha256: moderation.contentSha256,
    });
    const extension = FREE_MEDIA_EXTENSION[mimeType];
    if (!extension) {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: consumedMediaUnits,
        usage: null,
        refusal: null,
      });
      return refuse('provider_failed', copy);
    }
    const persisted = await persistGeneratedFileBytes(
      {
        userId: scoped.userId,
        organizationId: scoped.organizationId,
        data: generated.data,
        mimeType,
        filename: `free-generated-${mediaKind}.${extension}`,
        provider: offering.provider,
        origin: 'free_quota',
        model: entry.offeringKey,
        prompt: latestUserPrompt ? freeOfferingContentText(latestUserPrompt.content) : undefined,
        conversationId: body.conversation_id,
        extraMetadata: {
          aiAct: provenance,
          freeQuotaOffering: entry.offeringKey,
          generatedAt,
        },
      },
      scoped.db,
    );
    if (!persisted.ok) {
      await settleTurn(ledger, {
        outcome: 'failed',
        consumedUnits: consumedMediaUnits,
        usage: null,
        refusal: null,
      });
      return refuse('interrupted', copy);
    }
    await settleTurn(ledger, {
      outcome: 'completed',
      consumedUnits: consumedMediaUnits,
      usage: null,
      refusal: null,
    });
    const content =
      offering.category === 'image'
        ? `![Generated image](<${persisted.file.uri}>)`
        : `[View generated video](<${persisted.file.uri}>)`;
    const chunk = JSON.stringify({
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    });
    const finish = JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    return new Response(`data: ${chunk}\n\ndata: ${finish}\n\ndata: [DONE]\n\n`, { headers });
  } catch {
    await settleTurn(ledger, {
      outcome: 'failed',
      consumedUnits: consumedMediaUnits,
      usage: null,
      refusal: null,
    });
    return refuse('interrupted', copy);
  }
}
