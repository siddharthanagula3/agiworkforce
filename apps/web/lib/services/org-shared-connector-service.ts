import 'server-only';

import { randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import {
  getOrganizationEntitlements,
  getSharedConnectorLimitErrorMessage,
  isOrgResourceLimitError,
} from '@/lib/services/org-entitlements';

export const ORG_SHARED_CONNECTOR_PREFIX = 'orgmcp-';

export function orgSharedConnectorServerId(orgShortId: string): string {
  return `${ORG_SHARED_CONNECTOR_PREFIX}${orgShortId}`;
}

export function orgShortIdFromServerId(serverId: string): string | null {
  if (!serverId.startsWith(ORG_SHARED_CONNECTOR_PREFIX)) return null;
  const shortId = serverId.slice(ORG_SHARED_CONNECTOR_PREFIX.length);
  return /^[0-9a-f]{10}$/.test(shortId) ? shortId : null;
}

export interface SharedConnectorSummary {
  organizationId: string;
  connectorRowId: string;
  orgShortId: string;
  name: string;
  url: string;
  transport: string;
  ownerUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

interface SharedConnectorRow {
  organization_id: string;
  connector_row_id: string;
  org_short_id: string;
  shared_by_user_id: string;
  created_at: string;
  name: string;
  url: string;
  transport: string;
  user_id: string;
}

const SHARED_CONNECTOR_COLUMNS = `s.organization_id,
            s.connector_row_id,
            s.org_short_id,
            s.shared_by_user_id,
            s.created_at,
            c.name,
            c.url,
            c.transport,
            c.user_id`;

function toSummary(row: SharedConnectorRow): SharedConnectorSummary {
  return {
    organizationId: row.organization_id,
    connectorRowId: row.connector_row_id,
    orgShortId: row.org_short_id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    ownerUserId: row.user_id,
    sharedByUserId: row.shared_by_user_id,
    createdAt: row.created_at,
  };
}

export async function listSharedConnectors(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SharedConnectorSummary[]> {
  const rows = await db.query<SharedConnectorRow>(
    `select ${SHARED_CONNECTOR_COLUMNS}
       from public.organization_shared_connectors s
       join public.user_custom_connectors c on c.id = s.connector_row_id
      where s.organization_id = $1
      order by s.created_at desc`,
    [organizationId],
  );
  return rows.map(toSummary);
}

const SHORT_ID_MAX_ATTEMPTS = 5;

async function allocateOrgShortId(db: DatabaseAdapter, organizationId: string): Promise<string> {
  for (let attempt = 0; attempt < SHORT_ID_MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomBytes(5).toString('hex');
    const [row] = await db.query<{ exists: boolean }>(
      `select exists(
                select 1
                  from public.organization_shared_connectors
                 where organization_id = $1
                   and org_short_id = $2
              ) as exists`,
      [organizationId, candidate],
    );
    if (!row?.exists) return candidate;
  }
  throw createError.internal('Could not allocate a shared connector identifier. Try again.');
}

export interface ShareConnectorInput {
  organizationId: string;
  connectorRowId: string;
  actorUserId: string;
}

export async function shareConnector(
  db: DatabaseAdapter,
  input: ShareConnectorInput,
): Promise<SharedConnectorSummary> {
  const entitlements = await getOrganizationEntitlements(input.organizationId);
  if (entitlements.sharedConnectorLimit === 0) {
    throw createError.validation(getSharedConnectorLimitErrorMessage(0));
  }

  const orgShortId = await allocateOrgShortId(db, input.organizationId);

  let inserted: SharedConnectorRow | undefined;
  try {
    [inserted] = await db.query<SharedConnectorRow>(
      `with owned as materialized (
         select id, name, url, transport, user_id
           from public.user_custom_connectors
          where id = $2
            and user_id = $3
       ), grant_row as materialized (
         insert into public.organization_shared_connectors
           (organization_id, connector_row_id, org_short_id, shared_by_user_id)
         select $1, owned.id, $4, $3 from owned
         on conflict (organization_id, connector_row_id) do update
            set shared_by_user_id = excluded.shared_by_user_id
         returning organization_id, connector_row_id, org_short_id, shared_by_user_id, created_at
       ), quota_guard as materialized (
         select public.assert_org_resource_limit('org_shared_connectors', $1, $5)
           from (select count(*) from grant_row) as dependency
       )
       select grant_row.organization_id,
              grant_row.connector_row_id,
              grant_row.org_short_id,
              grant_row.shared_by_user_id,
              grant_row.created_at,
              owned.name,
              owned.url,
              owned.transport,
              owned.user_id
         from grant_row
         join owned on owned.id = grant_row.connector_row_id
        cross join quota_guard`,
      [
        input.organizationId,
        input.connectorRowId,
        input.actorUserId,
        orgShortId,
        entitlements.sharedConnectorLimit,
      ],
    );
  } catch (error) {
    if (isOrgResourceLimitError(error)) {
      throw createError.conflict(
        getSharedConnectorLimitErrorMessage(entitlements.sharedConnectorLimit),
      );
    }
    throw error;
  }

  if (!inserted) {
    throw createError.notFound('Connector not found');
  }

  return toSummary(inserted);
}

export async function unshareConnector(
  db: DatabaseAdapter,
  organizationId: string,
  connectorRowId: string,
): Promise<{ orgShortId: string } | null> {
  const rows = await db.query<{ org_short_id: string }>(
    `delete from public.organization_shared_connectors
      where organization_id = $1
        and connector_row_id = $2
      returning org_short_id`,
    [organizationId, connectorRowId],
  );
  const row = rows[0];
  return row ? { orgShortId: row.org_short_id } : null;
}
