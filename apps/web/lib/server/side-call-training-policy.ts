import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import type { AutoRoutingRequest } from '@agiworkforce/routing';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { readProviderTrainingOptOut } from '@/lib/server/provider-training-opt-out';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';

export async function sideCallTrainingOptOut(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<boolean> {
  try {
    return await readProviderTrainingOptOut(db, userId);
  } catch (error) {
    logger.warn(
      { error, userId },
      'Provider training opt-out unreadable; treating this background call as opted out',
    );
    return true;
  }
}

export function noTrainingProviderIds(providerIds: ReadonlySet<string>): Set<string> {
  return new Set([...providerIds].filter(providerKeepsInputsOutOfTraining));
}

export async function sideCallRoutingRequest<T extends AutoRoutingRequest>(
  db: Pick<DatabaseAdapter, 'query'> | null,
  userId: string,
  request: T,
  options: { forceNoTraining?: boolean } = {},
): Promise<T | null> {
  const scopedDb = db ?? createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  if (!options.forceNoTraining && !(await sideCallTrainingOptOut(scopedDb, userId))) {
    return request;
  }
  const providerIds = noTrainingProviderIds(
    request.availableProviderIds ?? listAvailableManagedProviderIds(),
  );
  return providerIds.size > 0 ? { ...request, availableProviderIds: providerIds } : null;
}

export async function sideCallProviderAllowed(
  db: Pick<DatabaseAdapter, 'query'> | null,
  userId: string,
  provider: string,
): Promise<boolean> {
  if (providerKeepsInputsOutOfTraining(provider)) return true;
  const scopedDb = db ?? createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  return !(await sideCallTrainingOptOut(scopedDb, userId));
}
