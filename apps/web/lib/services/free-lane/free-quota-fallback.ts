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
import { getRoutingSlotModel } from '@agiworkforce/types';
import {
  freeOfferingRequiresCodeExecution,
  freeOfferingRequiresWebAccess,
} from '@/features/models/lib/free-offering-request';
import { FALLBACK_REASON_HEADER, type FallbackReasonCode } from '@/lib/chat-fallback-reason';
import { logger } from '@/lib/logger';
import { loadFreePools } from '@/lib/server/free-pools';
import {
  freeQuotaContextFor,
  freeQuotaPlanAllows,
  resolveReadyFreeQuotaOffering,
} from '@/lib/server/free-quota-catalogue';
import { serveFreeQuotaTurn } from '@/lib/server/free-quota-turn';
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

function freeAutoTurn(
  body: unknown,
): { turn: FallbackTurn; assistantParentId: string | undefined } | null {
  const replayed = ReplayedFreeAutoTurnSchema.safeParse(body);
  if (!replayed.success || replayed.data.model !== getRoutingSlotModel('router_zero_cost')) {
    return null;
  }
  const turn = FallbackTurnSchema.safeParse({
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

export async function serveFreeQuotaFallback(input: {
  request: NextRequest;
  replay: Request;
  refusal: Response;
  userId: string;
  scopedDb: () => Promise<UserScopedDb>;
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
  const replayed = freeAutoTurn(await input.replay.json().catch(() => null));
  const requestId = input.request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!replayed || !requestId) return null;
  const { turn, assistantParentId } = replayed;
  const context = freeQuotaContextFor({ url: input.request.url, userId: input.userId });
  const choice = {
    inventory,
    category: 'chat',
    protocol: 'chat',
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
    const model = await resolveReadyFreeQuotaOffering(context, {
      ...choice,
      ranking: ranking.offeringKeys,
    });
    if (!model) return await decline();
    const served = await serveFreeQuotaTurn(
      input.request,
      await input.scopedDb(),
      { ...turn, model },
      {
        requestId,
        requestedModel: turn.model,
        reason,
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
