import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FREE_QUOTA_FALLBACK_REQUEST_KEY,
  FreeLimitSchema,
  FreeOfferingRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  normalizePromotionalChatHistory,
  type FreeLimit,
} from '@agiworkforce/cloud-contracts';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { getProviderOffering, getRoutingSlotModel } from '@agiworkforce/types';
import {
  freeOfferingRequiresCodeExecution,
  freeOfferingRequiresWebAccess,
} from '@/features/models/lib/free-offering-request';
import { FREE_QUOTA_FAILURE_CODES } from '@/features/models/lib/free-quota-copy';
import { FALLBACK_REASON_HEADER, type FallbackReasonCode } from '@/lib/chat-fallback-reason';
import { logger } from '@/lib/logger';
import { freeAutoQuotaFirstRoute, loadFreePools } from '@/lib/server/free-pools';
import {
  freeQuotaContextFor,
  freeQuotaPlanAllows,
  resolveReadyFreeQuotaOffering,
} from '@/lib/server/free-quota-catalogue';
import { serveFreeQuotaTurn } from '@/lib/server/free-quota-turn';
import { conversationKeepsOutOfTraining } from '@/lib/services/health-space-service';
import type { UserScopedDb } from '@/lib/server/rls-db';

import { FREE_CAPACITY_UNAVAILABLE_CODE } from './stage';

const FALLBACK_REASON_BY_REFUSAL: Readonly<Record<string, FallbackReasonCode>> = {
  [FREE_ALLOWANCE_EXHAUSTED_CODE]: 'free_limit_reached',
  [FREE_CAPACITY_UNAVAILABLE_CODE]: 'free_capacity_unavailable',
};

const ReplayedFreeAutoTurnSchema = z.looseObject({
  model: z.string(),
  stream: z.literal(true),
  [FREE_QUOTA_FALLBACK_REQUEST_KEY]: z.literal(true),
  assistant_parent_id: z.string().uuid().optional(),
  search_requested: z.literal(false).optional(),
  tools: z.array(z.unknown()).max(0).optional(),
  memory_command: z.undefined().optional(),
  research_resume: z.undefined().optional(),
  messages: z.array(
    z.looseObject({
      role: z.string(),
      content: z.union([
        z.string(),
        z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
      ]),
    }),
  ),
});

const FallbackTurnSchema = FreeOfferingRequestSchema.omit({ user_message: true });

type FallbackTurn = z.infer<typeof FallbackTurnSchema>;

const RouterOnlyContextSchema = z.looseObject({
  conversation_id: z.string().optional(),
  connector_tools_enabled: z.unknown(),
  messages: z.array(
    z.looseObject({
      role: z.string(),
      content: z.union([z.string(), z.array(z.looseObject({ type: z.string() }))]),
    }),
  ),
});

function routerOnlyContext(body: unknown): string | null {
  const parsed = RouterOnlyContextSchema.safeParse(body);
  if (!parsed.success) return 'unreadable_turn';
  if (parsed.data.connector_tools_enabled !== false) return 'connector_tools_not_off';
  const { messages } = parsed.data;
  const currentUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  return messages.every(
    (message, index) =>
      index === currentUserIndex ||
      typeof message.content === 'string' ||
      message.content.every((part) => part.type === 'text'),
  )
    ? null
    : 'earlier_attachment';
}

// A Health space chat, or one holding Google account data, stays on the route that already
// enforces its handling rule; the lane is for ordinary chat only.
async function conversationStaysOnTheRouter(
  scoped: UserScopedDb,
  userId: string,
  body: unknown,
): Promise<boolean> {
  const parsed = RouterOnlyContextSchema.safeParse(body);
  const conversationId = parsed.success ? parsed.data.conversation_id : undefined;
  return (
    conversationId !== undefined &&
    (await conversationKeepsOutOfTraining(scoped.db, userId, conversationId))
  );
}

const PLATFORM_MODERATION_REFUSAL_CODE = 'content_policy_violation';

const TURN_ENDING_REFUSALS: ReadonlySet<string> = new Set([
  PLATFORM_MODERATION_REFUSAL_CODE,
  FREE_QUOTA_FAILURE_CODES.duplicate,
]);

export function freeQuotaFallbackReplay(
  request: NextRequest,
  principal: { planTier: string | null | undefined; viaApiKey: boolean },
): Request | null {
  return !principal.viaApiKey && freeQuotaPlanAllows(principal.planTier) ? request.clone() : null;
}

interface FreeAutoRefusal {
  reason: FallbackReasonCode;
  body: { error: Record<string, unknown> };
  freeLimit: FreeLimit | null;
}

async function readFreeAutoRefusal(refusal: Response): Promise<FreeAutoRefusal | null> {
  if (refusal.ok) return null;
  const body = (await refusal
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  const error =
    body?.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : null;
  const code = error?.['code'];
  const reason = typeof code === 'string' ? FALLBACK_REASON_BY_REFUSAL[code] : undefined;
  if (!body || !error || !reason) return null;
  const freeLimit = FreeLimitSchema.safeParse(error['free_limit']);
  return {
    reason,
    body: { ...body, error },
    freeLimit: freeLimit.success ? freeLimit.data : null,
  };
}

function withFreeLimit(
  refusal: Response,
  body: FreeAutoRefusal['body'],
  freeLimit: FreeLimit,
): Response {
  const headers = new Headers(refusal.headers);
  headers.delete('content-length');
  return Response.json(
    { ...body, error: { ...body.error, free_limit: freeLimit } },
    { status: refusal.status, headers },
  );
}

function freeAutoTurn<Turn extends FallbackTurn>(
  body: unknown,
  schema: z.ZodType<Turn>,
): { turn: Turn; assistantParentId: string | undefined } | null {
  const replayed = ReplayedFreeAutoTurnSchema.safeParse(body);
  if (!replayed.success || replayed.data.model !== getRoutingSlotModel('router_zero_cost')) {
    return null;
  }
  const turn = schema.safeParse({
    ...replayed.data,
    messages: normalizePromotionalChatHistory(replayed.data.messages),
  });
  if (!turn.success) return null;
  return freeOfferingRequiresWebAccess(turn.data) || freeOfferingRequiresCodeExecution(turn.data)
    ? null
    : { turn: turn.data, assistantParentId: replayed.data.assistant_parent_id };
}

function readsImages(turn: FallbackTurn): boolean {
  const latest = turn.messages.findLast((message) => message.role === 'user');
  return (
    latest !== undefined &&
    typeof latest.content !== 'string' &&
    latest.content.some((part) => part.type === 'file')
  );
}

function carriesStreamError(chunk: Uint8Array): boolean {
  return new TextDecoder()
    .decode(chunk)
    .split('\n')
    .some((line) => {
      if (!line.startsWith('data:')) return false;
      try {
        const frame = JSON.parse(line.slice('data:'.length)) as { choices?: unknown };
        return (
          Array.isArray(frame.choices) &&
          frame.choices.some(
            (choice: { delta?: { x_stream_error?: unknown } | null } | null) =>
              choice?.delta?.x_stream_error !== undefined,
          )
        );
      } catch {
        return false;
      }
    });
}

async function answerFromFirstFrame(
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array> | null> {
  const reader = body.getReader();
  const first = await reader.read().catch(() => null);
  if (!first || first.done || carriesStreamError(first.value)) {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function refusalCode(refusal: Response): Promise<string | null> {
  const body = (await refusal
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: unknown } } | null;
  return typeof body?.error?.code === 'string' ? body.error.code : null;
}

export interface FreeQuotaFirstAttempt {
  response: Response | null;
  tried: string | null;
}

export async function serveFreeQuotaFirst(input: {
  request: NextRequest;
  replay: Request;
  userId: string;
  scopedDb: () => Promise<UserScopedDb>;
}): Promise<FreeQuotaFirstAttempt> {
  const inventory = loadFreePools().inventory;
  const route = freeAutoQuotaFirstRoute(inventory);
  if (!inventory || !route) return { response: null, tried: null };
  const body: unknown = await input.replay.json().catch(() => null);
  const replayed = freeAutoTurn(body, FreeOfferingRequestSchema);
  const requestId = input.request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!replayed || !requestId) return { response: null, tried: null };
  const { turn, assistantParentId } = replayed;
  const startedAtMs = Date.now();
  const firstByte = new AbortController();
  let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
  let model: string | null = null;
  const toRouter = (cause: string): FreeQuotaFirstAttempt => {
    logger.info(
      { userId: input.userId, model, cause, elapsedMs: Date.now() - startedAtMs },
      '[free-lane] the free quota lane did not answer a Free Auto turn; the free router takes it',
    );
    return { response: null, tried: model };
  };
  const routerOnly = routerOnlyContext(body);
  if (routerOnly) return toRouter(routerOnly);
  try {
    model = await resolveReadyFreeQuotaOffering(
      freeQuotaContextFor({ url: input.request.url, userId: input.userId }),
      {
        inventory,
        category: 'chat',
        needsImageInput: readsImages(turn),
        ranking: inventory.freeAutoFallback?.offeringKeys ?? [],
        spendExpiringFirst: true,
      },
    );
    if (!model) return toRouter('no_ready_offering');
    const provider = getProviderOffering(model)?.provider;
    if (!provider || !providerKeepsInputsOutOfTraining(provider)) {
      model = null;
      return toRouter('provider_training_policy');
    }
    const scoped = await input.scopedDb();
    if (await conversationStaysOnTheRouter(scoped, input.userId, body)) {
      model = null;
      return toRouter('conversation_handling_rule');
    }
    const served = await serveFreeQuotaTurn(
      input.request,
      scoped,
      { ...turn, model },
      {
        requestId,
        requestedModel: turn.model,
        providerRequestSignal: () => {
          firstByteTimer = setTimeout(() => firstByte.abort(), route.quotaFirstByteTimeoutMs);
          return firstByte.signal;
        },
        ...(assistantParentId ? { assistantParentId } : {}),
      },
    );
    if (!served.ok) {
      const code = await refusalCode(served);
      if (code !== null && TURN_ENDING_REFUSALS.has(code))
        return { response: served, tried: model };
      return toRouter(code ?? `http_${served.status}`);
    }
    const answer = served.body ? await answerFromFirstFrame(served.body) : null;
    if (!answer) return toRouter('failed_before_first_frame');
    logger.info(
      { userId: input.userId, model, elapsedMs: Date.now() - startedAtMs },
      '[free-lane] a free quota model answered a Free Auto turn first',
    );
    return {
      response: new Response(answer, { status: served.status, headers: served.headers }),
      tried: model,
    };
  } catch (error) {
    logger.error(
      { error, userId: input.userId, model },
      '[free-lane] the free quota lane failed before answering; the free router takes the turn',
    );
    return { response: null, tried: model };
  } finally {
    clearTimeout(firstByteTimer);
  }
}

export async function serveFreeQuotaFallback(input: {
  request: NextRequest;
  replay: Request;
  refusal: Response;
  userId: string;
  scopedDb: () => Promise<UserScopedDb>;
  tried?: string | null;
}): Promise<Response | null> {
  const refused = await readFreeAutoRefusal(input.refusal);
  const inventory = loadFreePools().inventory;
  const ranking = inventory?.freeAutoFallback;
  if (
    !refused ||
    !inventory ||
    !ranking ||
    (refused.reason === 'free_capacity_unavailable' && !ranking.spendOnCapacityShortage)
  ) {
    return null;
  }
  const { reason } = refused;
  const body: unknown = await input.replay.json().catch(() => null);
  const replayed = freeAutoTurn(body, FallbackTurnSchema);
  const requestId = input.request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!replayed || !requestId) return null;
  const { turn, assistantParentId } = replayed;
  const context = freeQuotaContextFor({ url: input.request.url, userId: input.userId });
  const choice = {
    inventory,
    category: 'chat',
    needsImageInput: readsImages(turn),
  } as const;
  const decline = async (triedModel?: string): Promise<Response | null> => {
    const { freeLimit } = refused;
    if (!freeLimit) return null;
    const alternative = await resolveReadyFreeQuotaOffering(context, {
      ...choice,
      ...(triedModel ? { excludeKey: triedModel } : {}),
      ranking: [...ranking.offeringKeys, ...inventory.entries.map((entry) => entry.offeringKey)],
    });
    return alternative
      ? withFreeLimit(input.refusal, refused.body, { ...freeLimit, alternative_model: alternative })
      : null;
  };
  try {
    if (input.tried) return await decline(input.tried);
    const model = await resolveReadyFreeQuotaOffering(context, {
      ...choice,
      ranking: ranking.offeringKeys,
    });
    if (!model) return await decline();
    const scoped = await input.scopedDb();
    if (await conversationStaysOnTheRouter(scoped, input.userId, body)) return null;
    const served = await serveFreeQuotaTurn(
      input.request,
      scoped,
      { ...turn, model },
      {
        requestId,
        requestedModel: turn.model,
        fallbackReason: reason,
        ...(assistantParentId ? { assistantParentId } : {}),
      },
    );
    if (!served.ok) return await decline(model);
    served.headers.set(FALLBACK_REASON_HEADER, reason);
    logger.info(
      { userId: input.userId, reason, model },
      '[free-lane] a free quota model answered a turn Free Auto could not',
    );
    return served;
  } catch (error) {
    logger.error(
      { error, userId: input.userId, reason },
      '[free-lane] the free quota fallback failed; the Free Auto refusal stands',
    );
    return null;
  }
}
