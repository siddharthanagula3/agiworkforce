import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import type { ConnectorAccessPolicy } from './connector-policy-evaluator';

export interface OrganizationConnectorPolicy extends ConnectorAccessPolicy {
  organizationId: string;
  updatedByUserId: string | null;
  updatedAt: string;
}

export const CONNECTOR_POLICY_LIST_LIMIT = 512;

interface Row {
  organization_id: string;
  allowed_connectors: string[];
  blocked_connectors: string[];
  allow_custom_connectors: boolean;
  updated_by_user_id: string | null;
  updated_at: string | Date;
}

const COLUMNS = `organization_id, allowed_connectors, blocked_connectors,
  allow_custom_connectors, updated_by_user_id, updated_at`;

function format(row: Row): OrganizationConnectorPolicy {
  return {
    organizationId: row.organization_id,
    allowedConnectors: [...row.allowed_connectors],
    blockedConnectors: [...row.blocked_connectors],
    allowCustomConnectors: row.allow_custom_connectors,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function readConnectorPolicy(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationConnectorPolicy | null> {
  const [row] = await db.query<Row>(
    `select ${COLUMNS}
       from public.organization_connector_policies
      where organization_id = $1
      limit 1`,
    [organizationId],
  );
  return row ? format(row) : null;
}

export async function readConnectorPolicySafely(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<OrganizationConnectorPolicy | null> {
  if (!organizationId) return null;
  try {
    return await readConnectorPolicy(db, organizationId);
  } catch (error) {
    logger.error(
      { error, organizationId },
      '[connector-policy] read failed; request treated as ungoverned',
    );
    return null;
  }
}

export interface ConnectorPolicyInput {
  allowedConnectors: string[];
  blockedConnectors: string[];
  allowCustomConnectors: boolean;
}

/** Whole-row write, for the reason the model policy gives: partial writes on interdependent lists silently carry or drop the fields nobody touched. */
export async function upsertConnectorPolicy(
  db: DatabaseAdapter,
  organizationId: string,
  input: ConnectorPolicyInput,
  updatedByUserId: string,
): Promise<OrganizationConnectorPolicy> {
  const [row] = await db.query<Row>(
    `insert into public.organization_connector_policies
       (organization_id, allowed_connectors, blocked_connectors,
        allow_custom_connectors, updated_by_user_id)
     values ($1, $2::text[], $3::text[], $4, $5)
     on conflict (organization_id) do update set
       allowed_connectors      = excluded.allowed_connectors,
       blocked_connectors      = excluded.blocked_connectors,
       allow_custom_connectors = excluded.allow_custom_connectors,
       updated_by_user_id      = excluded.updated_by_user_id
     returning ${COLUMNS}`,
    [
      organizationId,
      input.allowedConnectors,
      input.blockedConnectors,
      input.allowCustomConnectors,
      updatedByUserId,
    ],
  );
  if (!row) {
    throw new Error(`organization_connector_policies upsert returned no row for ${organizationId}`);
  }
  return format(row);
}

export function diffConnectorPolicy(
  before: OrganizationConnectorPolicy | null,
  after: OrganizationConnectorPolicy,
): string[] {
  const changed: string[] = [];
  if (!before) {
    if (after.allowedConnectors.length > 0) changed.push('allowedConnectors');
    if (after.blockedConnectors.length > 0) changed.push('blockedConnectors');
    if (!after.allowCustomConnectors) changed.push('allowCustomConnectors');
    return changed;
  }
  const same = (a: string[], b: string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!same(before.allowedConnectors, after.allowedConnectors)) changed.push('allowedConnectors');
  if (!same(before.blockedConnectors, after.blockedConnectors)) changed.push('blockedConnectors');
  if (before.allowCustomConnectors !== after.allowCustomConnectors) {
    changed.push('allowCustomConnectors');
  }
  return changed;
}
