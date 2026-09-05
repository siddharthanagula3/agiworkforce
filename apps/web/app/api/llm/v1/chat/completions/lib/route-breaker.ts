import 'server-only';

/**
 * The failover loop's view of the shared breakers.
 *
 * Read once, before the first attempt, and consulted synchronously from there:
 * the rotation path runs inside a live stream's failure handler, where a round
 * trip per candidate would put the store on a real user's latency budget.
 */
import { isRouteBreakerOpen } from '@agiworkforce/routing';

import { logger } from '@/lib/logger';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import {
  getCredentialHealthSnapshot,
  getRouteHealthSnapshot,
  providerOfRouteId,
  recordCredentialOutcome,
} from '@/lib/services/free-lane/runtime-state-service';

import { buildServingRouteId } from './tool-loop-anthropic';
import type { ProcessedRequest } from './request-processor';

const CREDENTIAL_REJECTED_OUTCOME = { class: 'credential_rejected' } as const;

export interface FailoverBreakerView {
  openCredentialProviders: readonly string[];
  onCredentialRejected: (provider: string) => void;
  isCandidateBreakerOpen: (candidate: { modelKey: string; provider: string }) => boolean;
}

function providerOfCandidate(modelKey: string, fallbackProvider: string): string {
  try {
    return resolveProviderFromModel(modelKey);
  } catch {
    return fallbackProvider;
  }
}

function candidateRouteIds(processed: ProcessedRequest): readonly string[] {
  const routeIds = new Set<string>([
    buildServingRouteId(processed.provider, processed.chatRequest.model),
  ]);
  for (const modelKey of processed.fallbackModels ?? []) {
    routeIds.add(buildServingRouteId(providerOfCandidate(modelKey, processed.provider), modelKey));
  }
  for (const routeId of processed.freeLane?.routesByRouteId.keys() ?? []) {
    routeIds.add(routeId);
  }
  return [...routeIds];
}

export function recordCredentialRejection(provider: string): void {
  void recordCredentialOutcome(provider, CREDENTIAL_REJECTED_OUTCOME).catch((error: unknown) => {
    logger.warn({ error, provider }, '[route-breaker] credential rejection was not recorded');
  });
}

/**
 * Fails OPEN throughout: an unreadable store yields an empty open set and a
 * predicate that admits everything, so a breaker that cannot see its own memory
 * never becomes the outage. The store logs the one line that says so.
 */
export async function resolveFailoverBreakerView(
  processed: ProcessedRequest,
  nowMs: number = Date.now(),
): Promise<FailoverBreakerView> {
  const routeIds = candidateRouteIds(processed);
  const providerIds = [...new Set(routeIds.map(providerOfRouteId))];

  const [routeSnapshots, credentialSnapshots] = await Promise.all([
    getRouteHealthSnapshot(routeIds, nowMs),
    getCredentialHealthSnapshot(providerIds, nowMs),
  ]);

  const openCredentialProviders = providerIds.filter((providerId) =>
    isRouteBreakerOpen(credentialSnapshots[providerId]),
  );

  return {
    openCredentialProviders,
    onCredentialRejected: recordCredentialRejection,
    isCandidateBreakerOpen: ({ modelKey, provider }) =>
      isRouteBreakerOpen(routeSnapshots[buildServingRouteId(provider, modelKey)]),
  };
}
