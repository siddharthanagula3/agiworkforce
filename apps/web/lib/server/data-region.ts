import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';

const MANAGED_CLOUD_GOVERNANCE_ID = 'managed_cloud';

type GovernanceRecords = Readonly<
  Record<string, { residencyRegions?: readonly string[] | null } | undefined>
>;

/**
 * The one residency region this deployment processes managed requests in, read
 * from the catalog's own governance record for managed cloud. `null` when that
 * record names no region or several, because then no single region can be
 * asserted for a request.
 */
export function managedCloudDataRegion(): string | null {
  const governance = modelRegistry.governance as unknown as GovernanceRecords;
  const regions = governance[MANAGED_CLOUD_GOVERNANCE_ID]?.residencyRegions;
  return regions && regions.length === 1 ? (regions[0] ?? null) : null;
}
