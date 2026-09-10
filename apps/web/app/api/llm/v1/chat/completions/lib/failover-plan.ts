import 'server-only';

import { GATEWAY_BACKED_HARNESS_IDS } from '@agiworkforce/types';
import type { AutoFallbackRoute } from '@agiworkforce/routing';

export interface FailoverRoute {
  modelKey: string;
  provider: string;
  routeId: string;
  harnessId: string;
}

const gatewayBackedHarnessIds: ReadonlySet<string> = new Set(GATEWAY_BACKED_HARNESS_IDS);

export function isGatewayBackedHarness(harnessId: string | undefined): boolean {
  return harnessId !== undefined && gatewayBackedHarnessIds.has(harnessId);
}

export function buildFailoverRoutes(
  fallbacks: readonly AutoFallbackRoute[],
): readonly FailoverRoute[] {
  return fallbacks.map(({ modelKey, provider, routeId, harnessId }) => ({
    modelKey,
    provider,
    routeId,
    harnessId,
  }));
}
