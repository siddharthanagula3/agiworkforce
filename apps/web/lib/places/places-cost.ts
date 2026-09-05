import 'server-only';

import { PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { PLACES_UNIT_PRICE_ENV, placesSearchCostCents } from '@/lib/places/places-config';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';

const PLACES_COST_SOURCE_PREFIX = 'places_search';

export interface PlacesSearchCostInput {
  userId: string;
  organizationId?: string | null;
  providerId: string;
  toolCallId: string;
  calls: number;
  delivered: boolean;
}

export async function recordPlacesSearchCost(input: PlacesSearchCostInput): Promise<void> {
  if (!Number.isFinite(input.calls) || input.calls <= 0) return;

  const costCents = placesSearchCostCents(input.calls);
  try {
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      provider: input.providerId,
      actualCostCents: costCents,
      sourceRef: `${PLACES_COST_SOURCE_PREFIX}:${input.toolCallId}`,
      taskOutcome: input.delivered ? 'delivered' : 'undelivered',
      taskRef: input.toolCallId,
      usage: {
        operation: 'tool',
        tool: PLACES_SEARCH_TOOL_NAME,
        requests: input.calls,
        unitPriceEnv: PLACES_UNIT_PRICE_ENV,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        toolCallId: input.toolCallId,
        provider: input.providerId,
      },
      '[places] could not record the places search cost event',
    );
  }
}
