import 'server-only';

import {
  SYNCED_APP_SURFACES,
  canUseBillingPlanCapability,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';

import { planAdmitsCodeExecution } from '@/lib/code-execution/required-execution';
import { buildMeCapabilityHandshake } from '@/lib/services/capability-handshake-service';

/**
 * What the product grants this account on this surface, for the chat prompt's
 * overview. It reads the same capability handshake `/api/me` serves, so the
 * model is told exactly what the app shows the user, and narrows it only where
 * the chat route enforces a stricter rule than the handshake records: a plan
 * without sandboxes never gets a code run.
 */
export interface ProductCapabilityFactsInput {
  readonly userId: string;
  readonly tier: string | null | undefined;
  readonly surface: string;
  readonly cloudExecutionDeploymentEnabled: boolean;
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
  });
  return document.granted.filter(
    (capability) => capability !== 'canUseCloudExecution' || planAdmitsCodeExecution(input.tier),
  );
}

export function productArtifactConnectors(
  tier: string | null | undefined,
  capabilities: readonly PlatformCapability[],
): boolean {
  return (
    capabilities.includes('canUseConnectors') &&
    canUseBillingPlanCapability(tier, 'artifact_connectors')
  );
}
