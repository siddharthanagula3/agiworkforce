import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_DATA_REGION,
  DataRegionUnavailableError,
  configuredDataRegions,
  excludedTransportsFor,
  normaliseDataRegion,
  resolveDataRegion,
  selectDataRegion,
  type DataRegionId,
  type DataRegionRuntime,
} from '@agiworkforce/compliance';

import { logger } from '@/lib/logger';
import { traceDatabaseAdapter } from '@/lib/observability/database-span';
import { recordAuditEvent } from '@/lib/security-audit';
import { SERVICE_POOL_TUNING } from '@/lib/server/db-pool-tuning';
import { reportDatabaseConnectionError } from '@/lib/server/db-connection-error';

/**
 * @file Serving one workspace from the region it is pinned to.
 *
 * `neon-db.ts` opens one pool against the deployment's own database, which is
 * the right answer for every workspace in the home region and the wrong answer
 * for any other. This module is the seam: a pool per provisioned region, chosen
 * by the workspace's `data_region`, with the same tuning the service pool
 * already uses.
 *
 * Only the home region is provisioned. A workspace pinned to any other is
 * refused rather than served from here, which is the point: a residency promise
 * that degrades to "somewhere else" under load is not a promise. Standing up a
 * second Neon project, an EU-jurisdiction bucket, a regional log sink and a
 * regional KMS is a founder action against real vendor accounts.
 */

const regionPools = new Map<DataRegionId, DatabaseAdapter>();

export function regionRuntime(
  region: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): DataRegionRuntime {
  return selectDataRegion(region, env);
}

export function provisionedRegions(
  env: Record<string, string | undefined> = process.env,
): readonly DataRegionId[] {
  return configuredDataRegions(env);
}

export function isRegionProvisioned(
  region: DataRegionId,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveDataRegion(region, env).provisioned;
}

/**
 * The database handle for one region. The home region keeps the deployment's
 * own connection string, so nothing changes for the workspaces already on it;
 * any other region gets a pool of its own against the connection string that
 * region names.
 */
export function getRegionDb(
  region: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): DatabaseAdapter {
  const runtime = regionRuntime(region, env);
  const existing = regionPools.get(runtime.region);
  if (existing) return existing;
  const created = traceDatabaseAdapter(
    createDatabaseClient({
      applicationName: `agi-web-${runtime.region}`,
      connectionString: runtime.databaseUrl,
      onConnectionError: reportDatabaseConnectionError,
      ...SERVICE_POOL_TUNING,
    }),
  );
  regionPools.set(runtime.region, created);
  return created;
}

export interface OrganizationRegionState {
  effective: DataRegionId;
  requested: DataRegionId | null;
  requestedAt: string | null;
  provisioned: boolean;
  missing: readonly string[];
}

interface RegionRow {
  data_region: string | null;
  data_region_requested: string | null;
  data_region_requested_at: string | Date | null;
}

export async function readOrganizationRegion(
  db: DatabaseAdapter,
  organizationId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<OrganizationRegionState> {
  const rows = await db.query<RegionRow>(
    `select data_region, data_region_requested, data_region_requested_at
       from public.organizations
      where id = $1
      limit 1`,
    [organizationId],
  );
  const row = rows[0] ?? null;
  const effective = normaliseDataRegion(row?.data_region ?? null) ?? DEFAULT_DATA_REGION;
  const resolution = resolveDataRegion(effective, env);
  const requestedAt = row?.data_region_requested_at ?? null;
  return {
    effective,
    requested: normaliseDataRegion(row?.data_region_requested ?? null),
    requestedAt:
      requestedAt instanceof Date ? requestedAt.toISOString() : (requestedAt as string | null),
    provisioned: resolution.provisioned,
    missing: resolution.provisioned ? [] : resolution.missing,
  };
}

export interface RegionMoveInput {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  target: DataRegionId;
  env?: Record<string, string | undefined>;
}

/**
 * A move is recorded as a request, never applied in place.
 *
 * Everything the workspace already holds sits in the region it was written to,
 * so flipping the column would claim a residency the bytes do not have. The
 * request is what a copy-and-cutover runbook works from, and
 * `completeOrganizationRegionMove` is what says the bytes arrived.
 */
export async function requestOrganizationRegionMove(
  input: RegionMoveInput,
): Promise<OrganizationRegionState> {
  const env = input.env ?? process.env;
  const resolution = resolveDataRegion(input.target, env);
  if (!resolution.provisioned) {
    throw new DataRegionUnavailableError(input.target, resolution.missing);
  }
  const current = await readOrganizationRegion(input.db, input.organizationId, env);
  await input.db.execute(
    `update public.organizations
        set data_region_requested = $2,
            data_region_requested_at = now()
      where id = $1`,
    [input.organizationId, input.target],
  );
  await recordAuditEvent({
    eventType: 'data_region_change_requested',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'data_region',
      resourceId: input.organizationId,
      previousRegion: current.effective,
      region: input.target,
    },
  });
  return { ...current, requested: input.target };
}

/**
 * Cutover. Called once the copy into the target region has been verified, which
 * is a runbook step against real infrastructure rather than something this
 * function can check for itself; it records the move and clears the request.
 */
export async function completeOrganizationRegionMove(
  input: RegionMoveInput,
): Promise<OrganizationRegionState> {
  const env = input.env ?? process.env;
  const current = await readOrganizationRegion(input.db, input.organizationId, env);
  if (current.requested !== input.target) {
    throw new Error(
      `Workspace ${input.organizationId} has no outstanding move to "${input.target}"; ` +
        'record the request before completing it.',
    );
  }
  await input.db.execute(
    `update public.organizations
        set data_region = $2,
            data_region_requested = null,
            data_region_requested_at = null
      where id = $1`,
    [input.organizationId, input.target],
  );
  await recordAuditEvent({
    eventType: 'data_region_changed',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'data_region',
      resourceId: input.organizationId,
      previousRegion: current.effective,
      region: input.target,
    },
  });
  logger.info(
    { organizationId: input.organizationId, from: current.effective, to: input.target },
    'Workspace data region cutover recorded',
  );
  return {
    effective: input.target,
    requested: null,
    requestedAt: null,
    provisioned: true,
    missing: [],
  };
}

export interface RegionPinnedInfrastructure {
  objectStorageEndpoint: string;
  objectStorageBucket: string;
  objectStorageJurisdiction: string | null;
  logDestination: string;
  keyManagementRegion: string;
}

/**
 * Where one workspace's objects, logs and keys belong.
 *
 * `objectStorageJurisdiction` is the one a reviewer asks about: a bucket in an
 * auto-region is not residency, because the provider may move its objects, so a
 * region that pins storage names the jurisdiction the bucket has to be created
 * under and the home region names none. Connector credentials follow the same
 * answer as the rest of the workspace's rows, since they live in the region's
 * own database.
 */
export function regionInfrastructure(
  region: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): RegionPinnedInfrastructure {
  const runtime = regionRuntime(region, env);
  return {
    objectStorageEndpoint: runtime.objectStorageEndpoint,
    objectStorageBucket: runtime.objectStorageBucket,
    objectStorageJurisdiction: runtime.definition.objectStorageJurisdiction,
    logDestination: runtime.logDestination,
    keyManagementRegion: runtime.keyManagementRegion,
  };
}

export class CustomerKeyRegionError extends Error {
  readonly region: DataRegionId;
  readonly keyRegion: string;
  readonly admitted: readonly string[];

  constructor(region: DataRegionId, keyRegion: string, admitted: readonly string[]) {
    super(
      admitted.length === 0
        ? `Data region "${region}" declares no key-management regions, so a key in "${keyRegion}" ` +
            'cannot be shown to sit inside it. Set the region’s KMS_REGION variable to the ' +
            'vendor regions customer keys may live in before activating one.'
        : `A key in "${keyRegion}" is outside data region "${region}", which admits ` +
            `${admitted.join(', ')}. A workspace whose rows are pinned to one jurisdiction and ` +
            'whose key is held in another has residency in neither.',
    );
    this.name = 'CustomerKeyRegionError';
    this.region = region;
    this.keyRegion = keyRegion;
    this.admitted = admitted;
  }
}

/**
 * Comma separated because one jurisdiction covers several vendor regions, and
 * empty because the deployment has not said, which activation refuses.
 */
export function keyManagementRegions(
  region: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): readonly string[] {
  return regionRuntime(region, env)
    .keyManagementRegion.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * An EU-pinned workspace whose key lives in a US KMS is not out of reach of a
 * US legal process, so the association is refused at activation, not in review.
 */
export function assertCustomerKeyRegion(
  dataRegion: string | null | undefined,
  keyRegion: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const runtime = regionRuntime(dataRegion, env);
  const admitted = keyManagementRegions(dataRegion, env);
  const candidate = keyRegion.trim().toLowerCase();
  if (admitted.some((entry) => entry.toLowerCase() === candidate)) return;
  throw new CustomerKeyRegionError(runtime.region, keyRegion, admitted);
}

/**
 * The transports a region refuses, in the shape the routing request already
 * takes. The home region's answer is the exclusion list the product has always
 * applied, so nothing moves for the deployment as configured today.
 */
export function regionExcludedTransports(
  knownTransports: Iterable<string>,
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  const runtime = regionRuntime(env['AGI_DATA_REGION'] ?? null, env);
  return excludedTransportsFor(runtime.inferenceRouteSet, knownTransports);
}

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
