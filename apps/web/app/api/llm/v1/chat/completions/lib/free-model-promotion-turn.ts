import 'server-only';

import { DEFAULT_DATA_REGION, allowedDeveloperJurisdictions } from '@agiworkforce/compliance';
import { developerJurisdictionAllowed } from '@agiworkforce/routing';

import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { managedCloudDataRegion } from '@/lib/server/data-region';
import {
  freeModelPromotionCoversPlan,
  freeModelPromotionCoversSelection,
  loadFreeModelPromotionConfig,
  messageTokenBound,
  promotionHistoryBudgetTokens,
  readFreeModelPromotion,
  type FreeModelPromotion,
  type FreeModelPromotionReservation,
  type PromotionSizedMessage,
} from '@/lib/server/free-model-promotion';
import {
  freeModelPromotionSearchesLeft,
  reserveFreeModelPromotionTurn,
  settleFreeModelPromotionTurn,
  type FreeModelPromotionLedger,
} from '@/lib/server/free-model-promotion-ledger';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';

import type { ContextSizing } from './context-window';

const DEVELOPER_API_SURFACE: CloudChatSurface = 'api';

export interface FreeModelPromotionHold {
  readonly reservation: FreeModelPromotionReservation;
  /** The Free reservation now carries the promotion and settles it with the turn. */
  handOver(): void;
  /** Returns the reservation when the turn ends before anything took it over. */
  releaseUnlessHandedOver(): Promise<void>;
}

export interface FreeModelPromotionTurn {
  promotion: FreeModelPromotion;
  hold: FreeModelPromotionHold;
  /** Whether the account has provider searches left on the promotion in its window. */
  webSearchAllowed: boolean;
}

function createHold(reservation: FreeModelPromotionReservation): FreeModelPromotionHold {
  let open = true;
  return {
    reservation,
    handOver() {
      open = false;
    },
    async releaseUnlessHandedOver() {
      if (!open) return;
      open = false;
      await settleFreeModelPromotionTurn(reservation, 0);
    },
  };
}

function latestUserMessage(
  messages: readonly { role: string; content: unknown }[],
): PromotionSizedMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return { content: message.content };
  }
  return null;
}

/**
 * Whether this turn is served by the free model promotion, and its spend held
 * if it is. Every refusal is silent and returns null, so the turn takes the
 * route it would have taken with no promotion running: a signed-in Free
 * account outside the developer API, asking for Auto or the promoted model,
 * in a region and under a training preference the model satisfies, with a
 * message small enough that its history can be trimmed under the prompt
 * ceiling, and with spend left to reserve.
 */
export async function admitFreeModelPromotionTurn(input: {
  userId: string;
  planTier: string | null | undefined;
  surface: CloudChatSurface;
  selection: string;
  messages: readonly { role: string; content: unknown }[];
  trainingOptOut: () => Promise<boolean>;
  region?: string | null;
  nowMs?: number;
  ledger?: FreeModelPromotionLedger | null;
}): Promise<FreeModelPromotionTurn | null> {
  if (!freeModelPromotionCoversPlan(input.planTier)) return null;
  if (input.surface === DEVELOPER_API_SURFACE) return null;
  const nowMs = input.nowMs ?? Date.now();
  const promotion = readFreeModelPromotion(nowMs);
  if (!promotion || !freeModelPromotionCoversSelection(promotion, input.selection)) return null;
  const region = input.region === undefined ? managedCloudDataRegion() : input.region;
  if (
    !developerJurisdictionAllowed(
      promotion.modelId,
      allowedDeveloperJurisdictions(region ?? DEFAULT_DATA_REGION),
    )
  ) {
    return null;
  }
  if (!modelKeepsInputsOutOfTraining(promotion.modelId) && (await input.trainingOptOut())) {
    return null;
  }
  const latest = latestUserMessage(input.messages);
  if (
    latest &&
    messageTokenBound(latest, promotion.imagePartTokenBound) > promotion.latestMessageTokenLimit
  ) {
    return null;
  }
  const reservation = await reserveFreeModelPromotionTurn({
    promotion,
    userId: input.userId,
    nowMs,
    ...(input.ledger === undefined ? {} : { ledger: input.ledger }),
  });
  if (!reservation) return null;
  const webSearchAllowed = await freeModelPromotionSearchesLeft(
    promotion,
    input.userId,
    nowMs,
    ...(input.ledger ? [input.ledger.store] : []),
  );
  return { promotion, hold: createHold(reservation), webSearchAllowed };
}

/** Trims a promoted turn's history by the token bound, inside what its tool definitions leave of the prompt budget. */
export function freeModelPromotionContextSizing(
  promotion: Pick<FreeModelPromotion, 'promptBudgetTokens' | 'imagePartTokenBound'>,
  tools: unknown,
): ContextSizing {
  return {
    budgetTokens: promotionHistoryBudgetTokens(promotion, tools),
    measure: (message) => messageTokenBound(message, promotion.imagePartTokenBound),
  };
}

/**
 * The same sizing for each provider step of a promoted tool loop, read from the
 * configuration rather than the live promotion: a turn admitted before the
 * promotion ended still has to finish under the ceiling it was admitted with.
 */
export function freeModelPromotionStepSizing(tools: unknown): ContextSizing {
  const config = loadFreeModelPromotionConfig();
  return freeModelPromotionContextSizing(
    {
      promptBudgetTokens: config.promptTokenCeiling - config.promptTokenHeadroom,
      imagePartTokenBound: config.imagePartTokenBound,
    },
    tools,
  );
}

export function freeModelPromotionToolResultHistoryChars(): number {
  return loadFreeModelPromotionConfig().toolResultHistoryChars;
}
