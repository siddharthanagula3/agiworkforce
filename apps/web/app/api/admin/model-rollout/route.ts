import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  canaryRoutingEnabled,
  observedHealthRankingEnabled,
  shadowMirroringEnabled,
} from '@agiworkforce/routing';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { listRecentRolloutBenchmarks } from '@/lib/services/model-rollout/rollout-evaluation-service';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const BENCHMARK_LIMIT = 100;

interface RolloutSlotPolicy {
  modelKey: string;
  canary?: { modelKey: string; trafficFraction: number };
  shadow?: { modelKey: string; dailyRequestCap: number };
}

export interface RolloutSlotView {
  slotId: string;
  modelKey: string;
  canaryModelKey: string | null;
  canaryTrafficFraction: number | null;
  shadowModelKey: string | null;
  shadowDailyRequestCap: number | null;
}

function rolloutSlots(): RolloutSlotView[] {
  return Object.entries(modelRegistry.policies.auto.slots as Record<string, RolloutSlotPolicy>)
    .filter(([, slot]) => slot.canary !== undefined || slot.shadow !== undefined)
    .map(([slotId, slot]) => ({
      slotId,
      modelKey: slot.modelKey,
      canaryModelKey: slot.canary?.modelKey ?? null,
      canaryTrafficFraction: slot.canary?.trafficFraction ?? null,
      shadowModelKey: slot.shadow?.modelKey ?? null,
      shadowDailyRequestCap: slot.shadow?.dailyRequestCap ?? null,
    }));
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  return NextResponse.json(
    {
      stages: {
        observedHealth: observedHealthRankingEnabled(),
        canary: canaryRoutingEnabled(),
        shadow: shadowMirroringEnabled(),
      },
      slots: rolloutSlots(),
      benchmarks: await listRecentRolloutBenchmarks(BENCHMARK_LIMIT),
    },
    { headers: NO_STORE },
  );
}

export const GET = withErrorHandler(handleGet);
