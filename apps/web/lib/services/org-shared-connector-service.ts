import 'server-only';

import { randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import {
  getOrganizationEntitlements,
  getSharedConnectorLimitErrorMessage,
  isOrgResourceLimitError,
} from '@/lib/services/org-entitlements';

/**
 * Org-scoped sharing of custom remote MCP connectors (migration 0086).
 *
 * WHAT SHARING A CONNECTOR MEANS — and what it deliberately does not.
 *
 * `user_custom_connectors.auth_header_enc` is a credential store. Sharing a row
 * shares the EFFECT of that bearer token, never the token itself:
 *
 *   - members INVOKE the connector; the server decrypts the credential inside
 *     the tool loop and never returns it on any wire;
 *   - members cannot read the credential, edit the URL, or delete the row —
 *     migration 0086 adds no policy at all to `user_custom_connectors`, and the
 *     summary shape below has no field for it;
 *   - SSRF re-validation still runs per catalog build and per execution
 *     (`assertResolvedPublicHostname` in lib/user-connector-tools.ts), because
 *     DNS can be re-pointed after the share.
 *
 * WHY A SEPARATE `org_short_id`. The chat-facing server id for a personal
 * connector is `custom-<short_id>`, and `short_id` is unique only per
 * `(user_id, short_id)`. Emitting a shared connector under the owner's personal
 * short id would collide with another member's personal connector inside one
 * conversation and cross-wire `connector_tool_permissions`, which is keyed
 * `(user_id, connector_id, tool_name)`. Shared connectors therefore get an
 * org-stable 10-hex id and their own `orgmcp-` prefix, so the two namespaces
 * can never overlap and per-member permission verdicts stay stably keyed.
 */

export const ORG_SHARED_CONNECTOR_PREFIX = 'orgmcp-';

export function orgSharedConnectorServerId(orgShortId: string): string {
  return `${ORG_SHARED_CONNECTOR_PREFIX}${orgShortId}`;
}

export function orgShortIdFromServerId(serverId: string): string | null {
  if (!serverId.startsWith(ORG_SHARED_CONNECTOR_PREFIX)) return null;
  const shortId = serverId.slice(ORG_SHARED_CONNECTOR_PREFIX.length);
  return /^[0-9a-f]{10}$/.test(shortId) ? shortId : null;
}

/** Auth-material-free view of a shared connector. There is no credential field. */
export interface SharedConnectorSummary {
  organizationId: string;
  /** `user_custom_connectors.id` — the un-share key. */
  connectorRowId: string;
  /** Org-stable chat-facing id: tools appear as `orgmcp-<orgShortId>`. */
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

/**
 * Everything the organization shares. `organizationId` is always the
 * server-derived membership org (see org-sharing-service.ts) — never a
 * client-supplied value.
 */
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

/**
 * Allocate an `org_short_id` unused inside this organization. The DB's
 * `idx_org_shared_connectors_short_id` unique index is the hard backstop; this
 * loop only avoids a pointless round-trip failure. 40 bits makes a same-org
 * collision practically impossible.
 */
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

/**
 * Share one of the actor's own connectors with the organization.
 *
 *   1. OWNERSHIP: the insert selects the connector by `(id, user_id)`, so an
 *      admin cannot conscript another member's personal connector — and
 *      therefore another member's bearer token — into the org's shared set.
 *      Zero rows means "not yours" and surfaces as 404.
 *   2. ORG-WIDE CEILING: `assert_org_resource_limit` takes a
 *      transaction-scoped advisory lock keyed on the organization BEFORE
 *      counting, in the same statement as the insert. Two admins sharing the
 *      25th and 26th connector concurrently serialize on that lock and the
 *      second transaction aborts. A TypeScript count-then-insert loses that
 *      race, which is why the count is not done here.
 *
 * The cap counts the org's SHARED set only. A member's personal connectors stay
 * on that member's own plan — seats are the unit of value, so an org does not
 * get to spend its shared allowance on private setups, and a member does not
 * lose their personal allowance by joining.
 */
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

/**
 * Stop sharing. Returns the org short id so the caller can evict the cached
 * catalog and close the open MCP handle immediately — otherwise a removed
 * member keeps calling a shared server until the process restarts.
 */
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
