import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTORS_COMING_SOON_MESSAGE,
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  connectorsReleased,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';

import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';

export async function artifactConnectorsGateResponse(
  userId: string,
  request: NextRequest,
  planTier: string | null | undefined,
  headers: HeadersInit,
): Promise<NextResponse | null> {
  if (!connectorsReleased()) {
    return NextResponse.json(
      { error: { code: 'connectors_coming_soon', message: CONNECTORS_COMING_SOON_MESSAGE } },
      { status: 403, headers },
    );
  }
  if (!canUseBillingPlanCapability(normalizeBillingPlanTier(planTier), 'artifact_connectors')) {
    return NextResponse.json(
      {
        error: {
          code: 'plan_upgrade_required',
          message: `Connected apps in published apps are available on ${billingPlanCapabilityPlanLabels('artifact_connectors')}.`,
        },
      },
      { status: 403, headers },
    );
  }
  return buildWorkspaceFeatureGateResponse(userId, request, 'artifact_connectors', 'web', headers);
}
