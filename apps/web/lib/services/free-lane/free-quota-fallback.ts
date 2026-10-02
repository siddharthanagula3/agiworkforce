import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FreeOfferingRequestSchema,
  normalizePromotionalChatHistory,
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
import { FREE_BUDGET_REACHED_ERROR_CLASS } from '@/lib/services/free-trial-service';

import { FREE_CAPACITY_UNAVAILABLE_CODE } from './stage';

const FALLBACK_REASON_BY_REFUSAL: Readonly<Record<string, FallbackReasonCode>> = {
  [FREE_ALLOWANCE_EXHAUSTED_CODE]: 'free_limit_reached',
  [FREE_CAPACITY_UNAVAILABLE_CODE]: 'free_capacity_unavailable',
  [FREE_BUDGET_REACHED_ERROR_CLASS]: 'free_usage_limit_reached',
};

const ReplayedFreeAutoTurnSchema = z.looseObject({
  model: z.string(),
  stream: z.literal(true),
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

async function refusalFallbackReason(refusal: Response): Promise<FallbackReasonCode | null> {
  if (refusal.ok) return null;
  const body = (await refusal
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: unknown } } | null;
  const code = body?.error?.code;
  return typeof code === 'string' ? (FALLBACK_REASON_BY_REFUSAL[code] ?? null) : null;
}

function freeAutoTurn(body: unknown): FallbackTurn | null {
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
    : turn.data;
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
  const reason = await refusalFallbackReason(input.refusal);
  if (!reason) return null;
  const turn = freeAutoTurn(await input.replay.json().catch(() => null));
  const inventory = loadFreePools().inventory;
  if (!turn || !inventory) return null;
  try {
    const model = await resolveReadyFreeQuotaOffering(
      freeQuotaContextFor({ url: input.request.url, userId: input.userId }),
      { inventory, category: 'chat', protocol: 'chat', needsImageInput: readsImages(turn) },
    );
    if (!model) return null;
    const served = await serveFreeQuotaTurn(input.request, await input.scopedDb(), {
      ...turn,
      model,
    });
    if (!served.ok) return null;
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
