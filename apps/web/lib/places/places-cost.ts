import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { chargeMicrousdForProviderCost, PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

import type { UsageAttribution } from '@/lib/billing/usage-attribution';
import { PLACES_SEARCH_FEATURE, placesSearchMicrousdPerCall } from '@/lib/places/places-config';
import type { FreeTrialToolSpend } from '@/lib/services/free-trial-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import {
  INCLUDED_SEARCH_ADMISSION,
  reserveSearchCharge,
  settleSearchCall,
  type SearchAdmission,
  type SearchChargeReservationOutcome,
} from '@/lib/web-search/search-budget';

const PLACES_COST_SOURCE_PREFIX = 'places_search';

export interface PlacesSearchBilling {
  userId: string;
  organizationId?: string | null;
  planTier: string | null | undefined;
  requestId: string;
  turnRef: string;
  surface?: string | null;
  attribution?: UsageAttribution;
  db: DatabaseAdapter;
  freeTrial?: FreeTrialToolSpend;
}

export function reservePlacesSearchCharge(
  billing: PlacesSearchBilling,
  call: { providerId: string; toolCallId: string },
): Promise<SearchChargeReservationOutcome> {
  if (billing.freeTrial) {
    return Promise.resolve<SearchChargeReservationOutcome>(
      billing.freeTrial.hold(placesSearchMicrousdPerCall())
        ? { outcome: 'admitted', admission: INCLUDED_SEARCH_ADMISSION }
        : {
            outcome: 'refused',
            error: new ManagedUsageRequestError(
              'The Free usage window cannot cover this places search.',
              429,
              'free_trial_token_budget_reached',
            ),
          },
    );
  }
  return reserveSearchCharge({
    userId: billing.userId,
    organizationId: billing.organizationId ?? null,
    planTier: billing.planTier,
    requestId: billing.requestId,
    callRef: call.toolCallId,
    feature: PLACES_SEARCH_FEATURE,
    provider: call.providerId,
    chargeMicrousd: chargeMicrousdForProviderCost(placesSearchMicrousdPerCall()),
    scope: 'places',
    ...(billing.attribution ? { attribution: billing.attribution } : {}),
    db: billing.db,
  });
}

export function settlePlacesSearchCall(
  billing: PlacesSearchBilling,
  call: {
    admission: SearchAdmission;
    providerId: string;
    toolCallId: string;
    billableCalls: number;
    answered: boolean;
  },
): Promise<void> {
  const calls =
    Number.isFinite(call.billableCalls) && call.billableCalls > 0 ? call.billableCalls : 0;
  billing.freeTrial?.settle(placesSearchMicrousdPerCall(), calls * placesSearchMicrousdPerCall());
  return settleSearchCall({
    userId: billing.userId,
    organizationId: billing.organizationId ?? null,
    admission: call.admission,
    feature: PLACES_SEARCH_FEATURE,
    provider: call.providerId,
    tool: PLACES_SEARCH_TOOL_NAME,
    calls,
    providerCostMicrousd: calls * placesSearchMicrousdPerCall(),
    charged: call.answered,
    delivered: call.answered,
    costRef: `${PLACES_COST_SOURCE_PREFIX}:${call.toolCallId}`,
    taskRef: billing.turnRef,
    surface: billing.surface ?? null,
    ...(billing.attribution ? { attribution: billing.attribution } : {}),
    db: billing.db,
  });
}
