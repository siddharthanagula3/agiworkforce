import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_DATA_REGION,
  DataRegionUnavailableError,
  normaliseDataRegion,
  resolveDataRegion,
  selectDataRegion,
  type DataRegionId,
} from '@agiworkforce/compliance';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

export function isRegionProvisioned(
  region: DataRegionId,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveDataRegion(region, env).provisioned;
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

export async function cancelOrganizationRegionMove(
  input: Omit<RegionMoveInput, 'target'>,
): Promise<OrganizationRegionState> {
  const env = input.env ?? process.env;
  const current = await readOrganizationRegion(input.db, input.organizationId, env);
  if (!current.requested) return current;
  await input.db.execute(
    `update public.organizations
        set data_region_requested = null,
            data_region_requested_at = null
      where id = $1`,
    [input.organizationId],
  );
  await recordAuditEvent({
    eventType: 'data_region_change_cancelled',
    userId: input.actorUserId,
    organizationId: input.organizationId,
    severity: 'info',
    detail: {
      resourceType: 'data_region',
      resourceId: input.organizationId,
      previousRegion: current.effective,
      region: current.requested,
    },
  });
  return { ...current, requested: null, requestedAt: null };
}

export class RegionMoveNotRequestedError extends Error {
  constructor(organizationId: string, target: DataRegionId) {
    super(
      `Workspace ${organizationId} has no outstanding move to "${target}"; ` +
        'record the request before completing it.',
    );
    this.name = 'RegionMoveNotRequestedError';
  }
}

export interface PendingRegionMove {
  organizationId: string;
  name: string;
  from: DataRegionId;
  to: DataRegionId;
  requestedAt: string | null;
}

export async function listPendingRegionMoves(db: DatabaseAdapter): Promise<PendingRegionMove[]> {
  const rows = await db.query<RegionRow & { id: string; name: string }>(
    `select id, name, data_region, data_region_requested, data_region_requested_at
       from public.organizations
      where data_region_requested is not null
      order by data_region_requested_at asc nulls last
      limit 200`,
  );
  return rows.flatMap((row) => {
    const to = normaliseDataRegion(row.data_region_requested);
    if (!to) return [];
    const requestedAt = row.data_region_requested_at;
    return [
      {
        organizationId: row.id,
        name: row.name,
        from: normaliseDataRegion(row.data_region) ?? DEFAULT_DATA_REGION,
        to,
        requestedAt:
          requestedAt instanceof Date ? requestedAt.toISOString() : (requestedAt as string | null),
      },
    ];
  });
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
    throw new RegionMoveNotRequestedError(input.organizationId, input.target);
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
  return selectDataRegion(region, env)
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
  const runtime = selectDataRegion(dataRegion, env);
  const admitted = keyManagementRegions(dataRegion, env);
  const candidate = keyRegion.trim().toLowerCase();
  if (admitted.some((entry) => entry.toLowerCase() === candidate)) return;
  throw new CustomerKeyRegionError(runtime.region, keyRegion, admitted);
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
