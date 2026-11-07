import 'server-only';

import {
  SYNCED_APP_SURFACES,
  canUseBillingPlanCapability,
  connectorsReleased,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';

import { planAdmitsCodeExecution } from '@/lib/code-execution/required-execution';
import {
  buildMeCapabilityHandshake,
  type CapabilityExclusions,
} from '@/lib/services/capability-handshake-service';

/**
 * What the product grants this account on this surface, for the chat prompt's
 * overview. It reads the same capability handshake `/api/me` serves, with the
 * same operator, account and workspace exclusions, so the model is told
 * what the app shows the user, narrowed by the chat route's code execution
 * entitlement and explicit selective-connector context.
 */
export interface ProductCapabilityFactsInput {
  readonly userId: string;
  readonly tier: string | null | undefined;
  readonly surface: string;
  readonly cloudExecutionDeploymentEnabled: boolean;
  readonly allowSelectiveConnectors?: boolean;
  readonly exclusions: CapabilityExclusions;
}

function syncedSurface(surface: string): SyncedAppSurface {
  return (SYNCED_APP_SURFACES as readonly string[]).includes(surface)
    ? (surface as SyncedAppSurface)
    : 'web';
}

export function productCapabilityFacts(
  input: ProductCapabilityFactsInput,
): readonly PlatformCapability[] {
  const document = buildMeCapabilityHandshake({
    userId: input.userId,
    tier: input.tier,
    surface: syncedSurface(input.surface),
    cloudExecutionDeploymentEnabled: input.cloudExecutionDeploymentEnabled,
    ...input.exclusions,
  });
  return document.granted.filter(
    (capability) =>
      (capability !== 'canUseCloudExecution' || planAdmitsCodeExecution(input.tier)) &&
      (capability !== 'canUseConnectors' ||
        connectorsReleased() ||
        input.allowSelectiveConnectors === true),
  );
}

export function productArtifactConnectors(
  tier: string | null | undefined,
  capabilities: readonly PlatformCapability[],
): boolean {
  return (
    connectorsReleased() &&
    capabilities.includes('canUseConnectors') &&
    canUseBillingPlanCapability(tier, 'artifact_connectors')
  );
}
