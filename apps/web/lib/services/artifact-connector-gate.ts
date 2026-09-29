import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';

import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';

export async function artifactConnectorsGateResponse(
  userId: string,
  request: NextRequest,
  planTier: string | null | undefined,
  headers: HeadersInit,
): Promise<NextResponse | null> {
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
