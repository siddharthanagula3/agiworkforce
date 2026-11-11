import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type PlacementTransaction = Pick<DatabaseAdapter, 'query'>;

const PLACEMENT_KEY_PREFIX = 'agi:legal-hold-placement:';

function placementKey(organizationId: string): string {
  return PLACEMENT_KEY_PREFIX + organizationId.toLowerCase();
}

// Storage deletion happens outside the transaction that could roll it back, so
// the hold check made before it has to stay true until the row is gone. Placing
// a hold takes the workspace key exclusively; a destroyer takes it shared before
// it reads the hold set. Either the destroyer finishes before the hold commits,
// or it starts after and sees the hold. Both release at transaction end.
export async function serializeHoldPlacement(
  tx: PlacementTransaction,
  organizationId: string,
): Promise<void> {
  await tx.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
    placementKey(organizationId),
  ]);
}

export async function serializeDestructionWithHolds(
  tx: PlacementTransaction,
  organizationId: string | null,
): Promise<void> {
  if (organizationId === null) return;
  await tx.query(`select pg_advisory_xact_lock_shared(hashtextextended($1::text, 0))`, [
    placementKey(organizationId),
  ]);
}
