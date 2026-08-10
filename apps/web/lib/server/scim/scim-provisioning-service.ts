import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import type { ScimGroupRow, ScimProvisionedUserRow, ProfileRow } from '@/lib/server/neon-types';
import {
  coerceScimBoolean,
  ScimError,
  SCIM_SCHEMA,
  type ScimFilter,
  type ScimGroupFilterAttribute,
  type ScimPagination,
  type ScimPatchOperation,
  type ScimUserFilterAttribute,
} from './scim-protocol';

/**
 * SCIM provisioning against the product's REAL member model.
 *
 * ## Why a SCIM user is not an account
 *
 * SCIM's contract is "create a user". This product cannot create one: there is
 * no Clerk user-creation call anywhere in the repo, there is no invitation
 * table, and `profiles` rows are minted lazily on first authenticated request
 * (`/api/settings/team` explicitly refuses unknown emails). Pretending POST
 * /Users mints an identity would be a lie the IdP would then act on.
 *
 * So a SCIM user is a first-class resource in `scim_provisioned_users` that
 * LINKS to an account when one with a matching email exists:
 *
 *   - link found  -> an `organization_members` row is written immediately with
 *                    `provisioning_source = 'scim'`
 *   - no link yet -> the resource is PENDING. The IdP gets a real, addressable
 *                    SCIM resource; no membership is granted.
 *
 * Deprovisioning does not depend on linkage: `active: false` or DELETE removes
 * the membership whenever one exists. That is the half of SCIM with real
 * security value, and it works completely.
 *
 * ## Two invariants that are never negotiable
 *
 * 1. An IdP can never create or remove an organization OWNER. A misconfigured
 *    group rule would otherwise be an unrecoverable privilege escalation or an
 *    orphaned organization.
 * 2. Every statement carries an explicit `connection_id`/`organization_id`
 *    predicate. SCIM has no app user, so `app_has_org_role()` cannot authorize
 *    it and RLS cannot be the tenant boundary here — the application is.
 */

export interface ScimConnectionContext {
  connectionId: string;
  organizationId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** SCIM resource ids are our uuids. A non-uuid can only ever be a 404, and
 * feeding it to Postgres would raise 22P02 instead. */
function assertResourceId(id: string, resource: 'User' | 'Group'): string {
  if (!UUID_PATTERN.test(id)) {
    throw new ScimError(404, `${resource} ${id} not found`);
  }
  return id;
}

const MAX_USER_NAME = 320;
const MAX_EXTERNAL_ID = 255;
const MAX_NAME_PART = 255;

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ScimError(400, `\`${field}\` is required and must be a string`, 'invalidValue');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ScimError(400, `\`${field}\` must not be empty`, 'invalidValue');
  }
  if (trimmed.length > maxLength) {
    throw new ScimError(400, `\`${field}\` exceeds ${maxLength} characters`, 'invalidValue');
  }
  return trimmed;
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ScimError(400, `\`${field}\` must be a string`, 'invalidValue');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw new ScimError(400, `\`${field}\` exceeds ${maxLength} characters`, 'invalidValue');
  }
  return trimmed;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ScimError(400, `\`${field}\` must be an object`, 'invalidSyntax');
  }
  return value as Record<string, unknown>;
}

/** Pick the primary email, falling back to the first entry, then to userName
 * when it is itself an address (Okta's default userName mapping). */
function extractEmail(emails: unknown, userName: string): string | null {
  if (Array.isArray(emails)) {
    const entries = emails
      .filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
      .map((entry) => ({
        value: typeof entry['value'] === 'string' ? entry['value'].trim() : '',
        primary: entry['primary'] === true || entry['primary'] === 'true',
      }))
      .filter((entry) => entry.value.length > 0 && entry.value.length <= MAX_USER_NAME);

    const primary = entries.find((entry) => entry.primary) ?? entries[0];
    if (primary) return primary.value;
  }
  return userName.includes('@') ? userName : null;
}

/**
 * Attribute names stripped from a SCIM payload before it is persisted to
 * `raw_attributes`.
 *
 * RFC 7643 §4.1.1 defines `password` as a WRITABLE attribute of the SCIM User
 * resource, and real IdPs send it — Okta and Entra ID both support pushing a
 * password on create. The provisioning service used to persist the parsed
 * request body verbatim (`JSON.stringify(rawBody)`), so any IdP configured to
 * push credentials wrote them to the database in PLAINTEXT, where they would
 * then be readable by every admin surface that renders raw_attributes and
 * would sit in every backup.
 *
 * We never need the password: provisioning links an existing AGI account by
 * email, and authentication is Clerk's. So it is dropped rather than hashed —
 * storing a hash of a credential we have no use for is still a liability.
 *
 * Matching is case-insensitive because SCIM attribute names are
 * case-insensitive per RFC 7644 §3.10.
 */
const SCIM_SENSITIVE_ATTRIBUTES = new Set(['password', 'currentpassword', 'newpassword']);

/**
 * Deep-strip credential attributes from a SCIM payload before persistence.
 *
 * Recurses because IdPs place attributes inside schema-extension objects
 * (e.g. `urn:ietf:params:scim:schemas:extension:...`), so a top-level-only
 * filter would miss them.
 */
export function stripScimSensitiveAttributes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripScimSensitiveAttributes);
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SCIM_SENSITIVE_ATTRIBUTES.has(key.toLowerCase())) continue;
    out[key] = stripScimSensitiveAttributes(nested);
  }
  return out;
}

export interface ParsedScimUser {
  userName: string;
  externalId: string | null;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
  active: boolean;
}

export function parseScimUserResource(body: unknown): ParsedScimUser {
  const record = asRecord(body, 'body');
  const userName = requireString(record['userName'], 'userName', MAX_USER_NAME);
  const name = record['name'] === undefined ? {} : asRecord(record['name'], 'name');

  return {
    userName,
    externalId: optionalString(record['externalId'], 'externalId', MAX_EXTERNAL_ID),
    email: extractEmail(record['emails'], userName),
    givenName: optionalString(name['givenName'], 'name.givenName', MAX_NAME_PART),
    familyName: optionalString(name['familyName'], 'name.familyName', MAX_NAME_PART),
    displayName: optionalString(record['displayName'], 'displayName', MAX_NAME_PART),
    active: record['active'] === undefined ? true : coerceScimBoolean(record['active'], 'active'),
  };
}

export interface ParsedScimGroup {
  displayName: string;
  externalId: string | null;
  memberIds: string[];
}

const MAX_GROUP_MEMBERS_PER_REQUEST = 500;

export function parseScimGroupResource(body: unknown): ParsedScimGroup {
  const record = asRecord(body, 'body');
  return {
    displayName: requireString(record['displayName'], 'displayName', MAX_NAME_PART),
    externalId: optionalString(record['externalId'], 'externalId', MAX_EXTERNAL_ID),
    memberIds: parseMemberValues(record['members']),
  };
}

export function parseMemberValues(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ScimError(400, '`members` must be an array', 'invalidSyntax');
  }
  if (value.length > MAX_GROUP_MEMBERS_PER_REQUEST) {
    throw new ScimError(
      400,
      `At most ${MAX_GROUP_MEMBERS_PER_REQUEST} members may be sent in one request`,
      'tooMany',
    );
  }
  const ids: string[] = [];
  for (const entry of value) {
    const member = asRecord(entry, 'members');
    const memberId = requireString(member['value'], 'members.value', 64);
    if (!UUID_PATTERN.test(memberId)) {
      throw new ScimError(400, `Unknown member id ${memberId}`, 'invalidValue');
    }
    if (!ids.includes(memberId)) ids.push(memberId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedScimUser {
  schemas: [typeof SCIM_SCHEMA.user];
  id: string;
  externalId?: string;
  userName: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: Array<{ value: string; primary: boolean }>;
  active: boolean;
  groups: Array<{ value: string; display: string }>;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
    location: string;
    version: string;
  };
  /**
   * Non-standard, deliberately namespaced: whether this SCIM resource is
   * attached to a real AGI account yet. An admin debugging "SCIM says the user
   * exists but they cannot sign in" needs this to be visible rather than
   * inferred, and a custom URN is the spec-sanctioned way to add it.
   */
  'urn:agiworkforce:params:scim:schemas:extension:2.0:Provisioning': {
    linked: boolean;
    membershipGranted: boolean;
  };
}

export function serializeScimUser(
  row: ScimProvisionedUserRow,
  groups: Array<Pick<ScimGroupRow, 'id' | 'display_name'>>,
  baseUrl: string,
): SerializedScimUser {
  const formatted = [row.given_name, row.family_name].filter(Boolean).join(' ');
  const hasName = Boolean(row.given_name || row.family_name);

  return {
    schemas: [SCIM_SCHEMA.user],
    id: row.id,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    userName: row.user_name,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(hasName
      ? {
          name: {
            ...(row.given_name ? { givenName: row.given_name } : {}),
            ...(row.family_name ? { familyName: row.family_name } : {}),
            ...(formatted ? { formatted } : {}),
          },
        }
      : {}),
    ...(row.email ? { emails: [{ value: row.email, primary: true }] } : {}),
    active: row.active,
    groups: groups.map((group) => ({ value: group.id, display: group.display_name })),
    meta: {
      resourceType: 'User',
      created: row.created_at,
      lastModified: row.updated_at,
      location: `${baseUrl}/Users/${row.id}`,
      version: `W/"${row.version}"`,
    },
    'urn:agiworkforce:params:scim:schemas:extension:2.0:Provisioning': {
      linked: row.linked_user_id !== null,
      membershipGranted: row.linked_user_id !== null && row.active,
    },
  };
}

export interface SerializedScimGroup {
  schemas: [typeof SCIM_SCHEMA.group];
  id: string;
  externalId?: string;
  displayName: string;
  members: Array<{ value: string; display: string }>;
  meta: {
    resourceType: 'Group';
    created: string;
    lastModified: string;
    location: string;
    version: string;
  };
}

export function serializeScimGroup(
  row: ScimGroupRow,
  members: Array<Pick<ScimProvisionedUserRow, 'id' | 'user_name'>>,
  baseUrl: string,
): SerializedScimGroup {
  return {
    schemas: [SCIM_SCHEMA.group],
    id: row.id,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    displayName: row.display_name,
    members: members.map((member) => ({ value: member.id, display: member.user_name })),
    meta: {
      resourceType: 'Group',
      created: row.created_at,
      lastModified: row.updated_at,
      location: `${baseUrl}/Groups/${row.id}`,
      version: `W/"${row.version}"`,
    },
  };
}

// ---------------------------------------------------------------------------
// Sync events
// ---------------------------------------------------------------------------

export async function recordSyncEvent(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  event: {
    eventType: string;
    userEmail?: string | null;
    payload?: Record<string, unknown> | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await db.execute(
      `insert into directory_sync_events
         (connection_id, organization_id, event_type, user_email, raw_payload, processed_at, error)
       values ($1, $2, $3, $4, $5::jsonb, now(), $6)`,
      [
        ctx.connectionId,
        ctx.organizationId,
        event.eventType,
        event.userEmail ?? null,
        event.payload ? JSON.stringify(event.payload) : null,
        event.error ?? null,
      ],
    );
  } catch (error) {
    // Never fail a provisioning call because the observability write failed —
    // but never swallow it silently either.
    logger.error({ error, eventType: event.eventType }, 'Failed to record directory sync event');
  }
}

async function touchConnection(db: DatabaseAdapter, ctx: ScimConnectionContext): Promise<void> {
  try {
    await db.execute(
      'update directory_sync_connections set last_sync_at = now() where id = $1 and organization_id = $2',
      [ctx.connectionId, ctx.organizationId],
    );
  } catch (error) {
    logger.error({ error, connectionId: ctx.connectionId }, 'Failed to update last_sync_at');
  }
}

// ---------------------------------------------------------------------------
// Membership reconciliation
// ---------------------------------------------------------------------------

export type ProvisionedRole = 'admin' | 'member' | 'viewer';

const ROLE_PRECEDENCE: Record<ProvisionedRole, number> = { admin: 3, member: 2, viewer: 1 };

/**
 * The strongest role mapped by any group the SCIM user belongs to, or null
 * when no group carries a mapping. Null means "do not touch the existing
 * role" — an org that has not configured group mapping must not have its
 * manually-assigned admins silently demoted the first time their IdP syncs.
 */
export function strongestMappedRole(
  roles: Array<ProvisionedRole | null | undefined>,
): ProvisionedRole | null {
  let best: ProvisionedRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!best || ROLE_PRECEDENCE[role] > ROLE_PRECEDENCE[best]) best = role;
  }
  return best;
}

async function resolveMappedRole(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  scimUserId: string,
): Promise<ProvisionedRole | null> {
  const rows = await db.query<{ mapped_role: ProvisionedRole | null }>(
    `select g.mapped_role
       from scim_group_members m
       join scim_groups g on g.id = m.group_id
      where m.scim_user_id = $1
        and m.organization_id = $2
        and g.connection_id = $3`,
    [scimUserId, ctx.organizationId, ctx.connectionId],
  );
  return strongestMappedRole(rows.map((row) => row.mapped_role));
}

/**
 * Attempt to attach a pending SCIM resource to a real account.
 *
 * Matching is by lower(email) against `profiles`, which is exactly how
 * /api/settings/team resolves an invitee today, so SCIM cannot reach an
 * identity the manual path could not.
 */
async function linkAccount(
  db: DatabaseAdapter,
  row: ScimProvisionedUserRow,
): Promise<string | null> {
  if (row.linked_user_id) return row.linked_user_id;
  if (!row.email) return null;

  const profiles = await db.query<Pick<ProfileRow, 'id'>>(
    'select id from profiles where lower(email) = lower($1) limit 1',
    [row.email],
  );
  const profileId = profiles[0]?.id ?? null;
  if (!profileId) return null;

  await db.execute(
    'update scim_provisioned_users set linked_user_id = $1, linked_at = now() where id = $2 and organization_id = $3',
    [profileId, row.id, row.organization_id],
  );
  return profileId;
}

export interface MembershipOutcome {
  linkedUserId: string | null;
  membershipGranted: boolean;
  membershipRevoked: boolean;
  role: ProvisionedRole | null;
}

/**
 * Reconcile one SCIM user against `organization_members`.
 *
 * `active: true`  -> membership exists (created when an account is linked)
 * `active: false` -> membership removed, whether or not the resource is linked
 *
 * Owners are untouchable in both directions.
 */
export async function reconcileMembership(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  row: ScimProvisionedUserRow,
): Promise<MembershipOutcome> {
  const linkedUserId = await linkAccount(db, row);

  if (!row.active) {
    let revoked = false;
    if (linkedUserId) {
      const deleted = await db.execute(
        `delete from organization_members
          where organization_id = $1
            and user_id = $2
            and role <> 'owner'`,
        [ctx.organizationId, linkedUserId],
      );
      revoked = deleted > 0;
    }
    return { linkedUserId, membershipGranted: false, membershipRevoked: revoked, role: null };
  }

  if (!linkedUserId) {
    // Honest pending state: the IdP has a resource, nobody gained access.
    return { linkedUserId: null, membershipGranted: false, membershipRevoked: false, role: null };
  }

  const mappedRole = await resolveMappedRole(db, ctx, row.id);

  // Role authority, in priority order:
  //   1. An OWNER is never touched. Losing the last owner to a misconfigured
  //      group rule would orphan the organization irrecoverably.
  //   2. A membership this connection already provisioned is IdP-AUTHORITATIVE:
  //      its role follows the group mapping, and falls back to 'member' when no
  //      mapping applies. That is what makes removing someone from an
  //      admin-mapped group actually demote them.
  //   3. A membership created by hand is only ever RAISED by a mapping, never
  //      silently demoted — turning on directory sync must not strip the
  //      manually-appointed admins an organization already has.
  await db.execute(
    `insert into organization_members
       (organization_id, user_id, role, provisioning_source, provisioned_at)
     values ($1, $2, coalesce($3::text, 'member'), 'scim', now())
     on conflict (organization_id, user_id) do update
       set role = case
             when organization_members.role = 'owner' then organization_members.role
             when organization_members.provisioning_source = 'scim'
               then coalesce($3::text, 'member')
             when $3::text is null then organization_members.role
             else $3::text
           end,
           provisioning_source = 'scim',
           provisioned_at = now()`,
    [ctx.organizationId, linkedUserId, mappedRole],
  );

  return {
    linkedUserId,
    membershipGranted: true,
    membershipRevoked: false,
    role: mappedRole,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const USER_COLUMNS = `id, connection_id, organization_id, external_id, user_name, email,
       given_name, family_name, display_name, active, linked_user_id, linked_at,
       raw_attributes, version, created_at, updated_at`;

/** Maps an allowlisted filter attribute to a fixed SQL predicate. The value is
 * always bound as `$3`; it is never interpolated. */
const USER_FILTER_SQL: Record<ScimUserFilterAttribute, string> = {
  userName: 'lower(user_name) = lower($3)',
  externalId: 'external_id = $3',
  'emails.value': 'lower(email) = lower($3)',
};

export async function listScimUsers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  filter: ScimFilter<ScimUserFilterAttribute> | null,
  pagination: ScimPagination,
): Promise<{ rows: ScimProvisionedUserRow[]; total: number }> {
  const where = ['connection_id = $1', 'organization_id = $2'];
  const params: unknown[] = [ctx.connectionId, ctx.organizationId];

  if (filter) {
    where.push(USER_FILTER_SQL[filter.attribute]);
    params.push(filter.value);
  }

  const whereSql = where.join(' and ');

  const totals = await db.query<{ count: string | number }>(
    `select count(*)::int as count from scim_provisioned_users where ${whereSql}`,
    params,
  );
  const total = Number(totals[0]?.count ?? 0);

  if (pagination.count === 0) {
    return { rows: [], total };
  }

  const rows = await db.query<ScimProvisionedUserRow>(
    `select ${USER_COLUMNS}
       from scim_provisioned_users
      where ${whereSql}
      order by created_at asc, id asc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, pagination.count, pagination.offset],
  );

  return { rows, total };
}

export async function getScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  userId: string,
): Promise<ScimProvisionedUserRow | null> {
  assertResourceId(userId, 'User');
  const rows = await db.query<ScimProvisionedUserRow>(
    `select ${USER_COLUMNS}
       from scim_provisioned_users
      where id = $1 and connection_id = $2 and organization_id = $3
      limit 1`,
    [userId, ctx.connectionId, ctx.organizationId],
  );
  return rows[0] ?? null;
}

export async function getScimUserGroups(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  userId: string,
): Promise<Array<Pick<ScimGroupRow, 'id' | 'display_name'>>> {
  return db.query<Pick<ScimGroupRow, 'id' | 'display_name'>>(
    `select g.id, g.display_name
       from scim_group_members m
       join scim_groups g on g.id = m.group_id
      where m.scim_user_id = $1
        and m.organization_id = $2
        and g.connection_id = $3
      order by g.display_name asc`,
    [userId, ctx.organizationId, ctx.connectionId],
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

/**
 * Create the SCIM resource and its membership as ONE unit.
 *
 * Splitting them meant a failure inside `reconcileMembership` — the
 * `organization_members` write, the only statement here that touches a table
 * SCIM does not own — left a `scim_provisioned_users` row behind after a 500.
 * The IdP retries a 500, and the retry then hit the userName uniqueness index
 * and answered 409 forever: a user who could never be provisioned and whose
 * resource granted no access.
 */
export async function createScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  input: ParsedScimUser,
  rawBody: Record<string, unknown>,
): Promise<ScimProvisionedUserRow> {
  const { row, outcome } = await db.transaction(async (tx) => {
    let rows: ScimProvisionedUserRow[];
    try {
      rows = await tx.query<ScimProvisionedUserRow>(
        `insert into scim_provisioned_users
         (connection_id, organization_id, external_id, user_name, email,
          given_name, family_name, display_name, active, raw_attributes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       returning ${USER_COLUMNS}`,
        [
          ctx.connectionId,
          ctx.organizationId,
          input.externalId,
          input.userName,
          input.email,
          input.givenName,
          input.familyName,
          input.displayName,
          input.active,
          // Credentials are stripped before persistence — see stripScimSensitiveAttributes.
          JSON.stringify(stripScimSensitiveAttributes(rawBody)),
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `User ${input.userName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const created = rows[0];
    if (!created) throw new Error('Failed to create SCIM user: no row returned');

    return { row: created, outcome: await reconcileMembership(tx, ctx, created) };
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'user.provisioned',
    userEmail: row.email,
    payload: {
      scimUserId: row.id,
      linked: outcome.linkedUserId !== null,
      membershipGranted: outcome.membershipGranted,
    },
  });

  return (await getScimUser(db, ctx, row.id)) ?? row;
}

export async function replaceScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  userId: string,
  input: ParsedScimUser,
  rawBody: Record<string, unknown>,
): Promise<ScimProvisionedUserRow> {
  const existing = await getScimUser(db, ctx, userId);
  if (!existing) throw new ScimError(404, `User ${userId} not found`);

  // The attribute write and the access change are one unit. `active: false` is
  // a deprovision: persisting it while the `organization_members` delete fails
  // would leave a resource that READS as deactivated next to a person who still
  // has access — the most dangerous way for this call to half-succeed.
  const { row, outcome } = await db.transaction(async (tx) => {
    let rows: ScimProvisionedUserRow[];
    try {
      rows = await tx.query<ScimProvisionedUserRow>(
        `update scim_provisioned_users
          set external_id = $4,
              user_name = $5,
              email = $6,
              given_name = $7,
              family_name = $8,
              display_name = $9,
              active = $10,
              raw_attributes = $11::jsonb,
              version = version + 1
        where id = $1 and connection_id = $2 and organization_id = $3
        returning ${USER_COLUMNS}`,
        [
          userId,
          ctx.connectionId,
          ctx.organizationId,
          input.externalId,
          input.userName,
          input.email,
          input.givenName,
          input.familyName,
          input.displayName,
          input.active,
          // Credentials are stripped before persistence — see stripScimSensitiveAttributes.
          JSON.stringify(stripScimSensitiveAttributes(rawBody)),
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `User ${input.userName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const replaced = rows[0];
    if (!replaced) throw new ScimError(404, `User ${userId} not found`);

    return { row: replaced, outcome: await reconcileMembership(tx, ctx, replaced) };
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: row.active ? 'user.updated' : 'user.deactivated',
    userEmail: row.email,
    payload: {
      scimUserId: row.id,
      membershipGranted: outcome.membershipGranted,
      membershipRevoked: outcome.membershipRevoked,
    },
  });

  return (await getScimUser(db, ctx, row.id)) ?? row;
}

/**
 * Attribute paths this service provider honours in PATCH.
 *
 * Entra sends `emails[type eq "work"].value`; the value-filter segment is
 * stripped because this provider stores exactly one address per user. Anything
 * outside this map is refused with `invalidPath` rather than accepted and
 * ignored — an ignored deprovision is the worst possible failure mode.
 */
const USER_PATCH_PATHS = new Set([
  'username',
  'externalid',
  'displayname',
  'active',
  'name.givenname',
  'name.familyname',
  'emails.value',
  'emails',
  'name',
]);

function normalizePatchPath(path: string): string {
  return path
    .replace(/\[[^\]]*\]/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

interface UserPatchState {
  userName: string;
  externalId: string | null;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
  active: boolean;
}

function applyUserAttribute(state: UserPatchState, path: string, value: unknown, remove: boolean) {
  switch (path) {
    case 'username':
      if (remove) throw new ScimError(400, 'userName cannot be removed', 'mutability');
      state.userName = requireString(value, 'userName', MAX_USER_NAME);
      return;
    case 'externalid':
      state.externalId = remove ? null : optionalString(value, 'externalId', MAX_EXTERNAL_ID);
      return;
    case 'displayname':
      state.displayName = remove ? null : optionalString(value, 'displayName', MAX_NAME_PART);
      return;
    case 'active':
      if (remove) throw new ScimError(400, 'active cannot be removed', 'mutability');
      state.active = coerceScimBoolean(value, 'active');
      return;
    case 'name.givenname':
      state.givenName = remove ? null : optionalString(value, 'name.givenName', MAX_NAME_PART);
      return;
    case 'name.familyname':
      state.familyName = remove ? null : optionalString(value, 'name.familyName', MAX_NAME_PART);
      return;
    case 'emails.value':
      state.email = remove ? null : optionalString(value, 'emails.value', MAX_USER_NAME);
      return;
    case 'emails': {
      if (remove) {
        state.email = null;
        return;
      }
      state.email = extractEmail(value, state.userName);
      return;
    }
    case 'name': {
      if (remove) {
        state.givenName = null;
        state.familyName = null;
        return;
      }
      const name = asRecord(value, 'name');
      state.givenName = optionalString(name['givenName'], 'name.givenName', MAX_NAME_PART);
      state.familyName = optionalString(name['familyName'], 'name.familyName', MAX_NAME_PART);
      return;
    }
    default:
      throw new ScimError(400, `Unsupported PATCH path "${path}"`, 'invalidPath');
  }
}

export function applyUserPatchOperations(
  row: ScimProvisionedUserRow,
  operations: ScimPatchOperation[],
): UserPatchState {
  const state: UserPatchState = {
    userName: row.user_name,
    externalId: row.external_id,
    email: row.email,
    givenName: row.given_name,
    familyName: row.family_name,
    displayName: row.display_name,
    active: row.active,
  };

  for (const operation of operations) {
    if (operation.path === undefined) {
      // Path-less add/replace: the value object's keys are the attributes.
      // This is the shape Microsoft Entra uses for `{"active": false}`.
      if (operation.op === 'remove') {
        throw new ScimError(400, 'A `remove` operation requires a `path`', 'noTarget');
      }
      const value = asRecord(operation.value, 'value');
      for (const [key, attributeValue] of Object.entries(value)) {
        const normalized = normalizePatchPath(key);
        if (!USER_PATCH_PATHS.has(normalized)) {
          throw new ScimError(400, `Unsupported PATCH attribute "${key}"`, 'invalidPath');
        }
        applyUserAttribute(state, normalized, attributeValue, false);
      }
      continue;
    }

    const normalized = normalizePatchPath(operation.path);
    if (!USER_PATCH_PATHS.has(normalized)) {
      throw new ScimError(400, `Unsupported PATCH path "${operation.path}"`, 'invalidPath');
    }
    applyUserAttribute(state, normalized, operation.value, operation.op === 'remove');
  }

  return state;
}

export async function patchScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  userId: string,
  operations: ScimPatchOperation[],
): Promise<ScimProvisionedUserRow> {
  const existing = await getScimUser(db, ctx, userId);
  if (!existing) throw new ScimError(404, `User ${userId} not found`);

  const state = applyUserPatchOperations(existing, operations);

  // PATCH is the shape every IdP uses to deprovision (`replace active false`),
  // so the attribute write and the membership revocation commit together or
  // not at all — see replaceScimUser for why the half-applied case is unsafe.
  const { row, outcome } = await db.transaction(async (tx) => {
    let rows: ScimProvisionedUserRow[];
    try {
      rows = await tx.query<ScimProvisionedUserRow>(
        `update scim_provisioned_users
          set user_name = $4,
              external_id = $5,
              email = $6,
              given_name = $7,
              family_name = $8,
              display_name = $9,
              active = $10,
              version = version + 1
        where id = $1 and connection_id = $2 and organization_id = $3
        returning ${USER_COLUMNS}`,
        [
          userId,
          ctx.connectionId,
          ctx.organizationId,
          state.userName,
          state.externalId,
          state.email,
          state.givenName,
          state.familyName,
          state.displayName,
          state.active,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `User ${state.userName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const patched = rows[0];
    if (!patched) throw new ScimError(404, `User ${userId} not found`);

    return { row: patched, outcome: await reconcileMembership(tx, ctx, patched) };
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: row.active ? 'user.updated' : 'user.deactivated',
    userEmail: row.email,
    payload: {
      scimUserId: row.id,
      membershipGranted: outcome.membershipGranted,
      membershipRevoked: outcome.membershipRevoked,
    },
  });

  return (await getScimUser(db, ctx, row.id)) ?? row;
}

/**
 * Hard deprovision. The membership goes first: if the resource delete failed
 * afterwards the person would still have lost access, which is the safe
 * direction to fail in.
 */
export async function deleteScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  userId: string,
): Promise<void> {
  const existing = await getScimUser(db, ctx, userId);
  if (!existing) throw new ScimError(404, `User ${userId} not found`);

  let membershipRevoked = false;
  if (existing.linked_user_id) {
    const deleted = await db.execute(
      `delete from organization_members
        where organization_id = $1
          and user_id = $2
          and role <> 'owner'`,
      [ctx.organizationId, existing.linked_user_id],
    );
    membershipRevoked = deleted > 0;
  }

  await db.execute(
    'delete from scim_provisioned_users where id = $1 and connection_id = $2 and organization_id = $3',
    [userId, ctx.connectionId, ctx.organizationId],
  );

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'user.deprovisioned',
    userEmail: existing.email,
    payload: { scimUserId: userId, membershipRevoked },
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

const GROUP_COLUMNS = `id, connection_id, organization_id, external_id, display_name,
       mapped_role, version, created_at, updated_at`;

const GROUP_FILTER_SQL: Record<ScimGroupFilterAttribute, string> = {
  displayName: 'lower(display_name) = lower($3)',
  externalId: 'external_id = $3',
};

export async function listScimGroups(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  filter: ScimFilter<ScimGroupFilterAttribute> | null,
  pagination: ScimPagination,
): Promise<{ rows: ScimGroupRow[]; total: number }> {
  const where = ['connection_id = $1', 'organization_id = $2'];
  const params: unknown[] = [ctx.connectionId, ctx.organizationId];

  if (filter) {
    where.push(GROUP_FILTER_SQL[filter.attribute]);
    params.push(filter.value);
  }

  const whereSql = where.join(' and ');

  const totals = await db.query<{ count: string | number }>(
    `select count(*)::int as count from scim_groups where ${whereSql}`,
    params,
  );
  const total = Number(totals[0]?.count ?? 0);

  if (pagination.count === 0) {
    return { rows: [], total };
  }

  const rows = await db.query<ScimGroupRow>(
    `select ${GROUP_COLUMNS}
       from scim_groups
      where ${whereSql}
      order by created_at asc, id asc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, pagination.count, pagination.offset],
  );

  return { rows, total };
}

export async function getScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
): Promise<ScimGroupRow | null> {
  assertResourceId(groupId, 'Group');
  const rows = await db.query<ScimGroupRow>(
    `select ${GROUP_COLUMNS}
       from scim_groups
      where id = $1 and connection_id = $2 and organization_id = $3
      limit 1`,
    [groupId, ctx.connectionId, ctx.organizationId],
  );
  return rows[0] ?? null;
}

export async function getScimGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
): Promise<Array<Pick<ScimProvisionedUserRow, 'id' | 'user_name'>>> {
  return db.query<Pick<ScimProvisionedUserRow, 'id' | 'user_name'>>(
    `select u.id, u.user_name
       from scim_group_members m
       join scim_provisioned_users u on u.id = m.scim_user_id
      where m.group_id = $1
        and m.organization_id = $2
        and u.connection_id = $3
      order by u.user_name asc`,
    [groupId, ctx.organizationId, ctx.connectionId],
  );
}

/**
 * Attach members to a group, refusing ids that belong to another tenant or
 * another connection. A cross-tenant member id is a 400, never a silent skip.
 */
async function addGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  for (const memberId of memberIds) {
    const target = await getScimUser(db, ctx, memberId);
    if (!target) {
      throw new ScimError(400, `Unknown member id ${memberId}`, 'invalidValue');
    }
    await db.execute(
      `insert into scim_group_members (group_id, scim_user_id, organization_id)
       values ($1, $2, $3)
       on conflict (group_id, scim_user_id) do nothing`,
      [groupId, memberId, ctx.organizationId],
    );
  }
}

async function removeGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  for (const memberId of memberIds) {
    await db.execute(
      'delete from scim_group_members where group_id = $1 and scim_user_id = $2 and organization_id = $3',
      [groupId, memberId, ctx.organizationId],
    );
  }
}

/** Re-run membership reconciliation for everyone in a group whose role mapping
 * may have changed. Group edits are the only way a SCIM user's ROLE moves. */
async function reconcileGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  scimUserIds: string[],
): Promise<void> {
  for (const scimUserId of scimUserIds) {
    const row = await getScimUser(db, ctx, scimUserId);
    if (row) await reconcileMembership(db, ctx, row);
  }
}

/**
 * Every group write below runs inside ONE transaction.
 *
 * A group write is never a single statement: it touches `scim_groups`,
 * `scim_group_members`, and — through reconciliation — `organization_members`.
 * Run unwrapped, a member id the IdP has not provisioned yet (which is routine:
 * Okta and Entra do not guarantee user-before-group ordering) made
 * `addGroupMembers` throw 400 partway through, leaving:
 *
 *   - on POST, an orphan `scim_groups` row. The IdP saw a failure, retried the
 *     identical create, and got 409 uniqueness from then on — the group could
 *     never converge.
 *   - on PUT/PATCH-replace, an EMPTIED member set, because the delete lands
 *     before the failing re-add. Everyone whose role came from that group was
 *     silently demoted by a request that returned an error.
 *
 * `touchConnection` and `recordSyncEvent` stay OUTSIDE the transaction and run
 * only after it commits: they are best-effort observability that must not be
 * able to roll back real work, and an event describing a rolled-back write
 * would be a false audit record.
 */
export async function createScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  input: ParsedScimGroup,
): Promise<ScimGroupRow> {
  const row = await db.transaction(async (tx) => {
    let rows: ScimGroupRow[];
    try {
      rows = await tx.query<ScimGroupRow>(
        `insert into scim_groups (connection_id, organization_id, external_id, display_name)
       values ($1, $2, $3, $4)
       returning ${GROUP_COLUMNS}`,
        [ctx.connectionId, ctx.organizationId, input.externalId, input.displayName],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `Group ${input.displayName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const created = rows[0];
    if (!created) throw new Error('Failed to create SCIM group: no row returned');

    await addGroupMembers(tx, ctx, created.id, input.memberIds);
    await reconcileGroupMembers(tx, ctx, input.memberIds);
    return created;
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'group.provisioned',
    payload: {
      scimGroupId: row.id,
      displayName: row.display_name,
      members: input.memberIds.length,
    },
  });

  return row;
}

export async function replaceScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  input: ParsedScimGroup,
): Promise<ScimGroupRow> {
  const existing = await getScimGroup(db, ctx, groupId);
  if (!existing) throw new ScimError(404, `Group ${groupId} not found`);

  const row = await db.transaction(async (tx) => {
    const previousMembers = await getScimGroupMembers(tx, ctx, groupId);

    let rows: ScimGroupRow[];
    try {
      rows = await tx.query<ScimGroupRow>(
        `update scim_groups
          set display_name = $4, external_id = $5, version = version + 1
        where id = $1 and connection_id = $2 and organization_id = $3
        returning ${GROUP_COLUMNS}`,
        [groupId, ctx.connectionId, ctx.organizationId, input.displayName, input.externalId],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `Group ${input.displayName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const updated = rows[0];
    if (!updated) throw new ScimError(404, `Group ${groupId} not found`);

    // PUT replaces the member set wholesale. The delete and the re-add are one
    // unit: a bad id in `input.memberIds` must not leave the group emptied.
    await tx.execute(
      'delete from scim_group_members where group_id = $1 and organization_id = $2',
      [groupId, ctx.organizationId],
    );
    await addGroupMembers(tx, ctx, groupId, input.memberIds);

    const affected = new Set([...previousMembers.map((member) => member.id), ...input.memberIds]);
    await reconcileGroupMembers(tx, ctx, [...affected]);
    return updated;
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'group.updated',
    payload: { scimGroupId: groupId, members: input.memberIds.length },
  });

  return row;
}

const GROUP_PATCH_PATHS = new Set(['members', 'displayname', 'externalid']);

export async function patchScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  operations: ScimPatchOperation[],
): Promise<ScimGroupRow> {
  const existing = await getScimGroup(db, ctx, groupId);
  if (!existing) throw new ScimError(404, `Group ${groupId} not found`);

  // RFC 7644 §3.5.2: "the server MUST apply the entire set of operations or
  // none". Every operation in the list therefore runs in one transaction, so a
  // list like [remove members, add unknown-member] cannot commit the remove and
  // then fail — which previously emptied the group and demoted its members on a
  // request that returned 400.
  const row = await db.transaction(async (tx) => {
    let displayName = existing.display_name;
    let externalId = existing.external_id;
    const affected = new Set<string>();

    for (const operation of operations) {
      const normalized = operation.path ? normalizePatchPath(operation.path) : 'members';

      if (!GROUP_PATCH_PATHS.has(normalized)) {
        throw new ScimError(400, `Unsupported PATCH path "${operation.path}"`, 'invalidPath');
      }

      if (normalized === 'displayname') {
        displayName = requireString(operation.value, 'displayName', MAX_NAME_PART);
        continue;
      }

      if (normalized === 'externalid') {
        externalId =
          operation.op === 'remove'
            ? null
            : optionalString(operation.value, 'externalId', MAX_EXTERNAL_ID);
        continue;
      }

      // members
      if (operation.op === 'remove' && operation.value === undefined) {
        const current = await getScimGroupMembers(tx, ctx, groupId);
        current.forEach((member) => affected.add(member.id));
        await tx.execute(
          'delete from scim_group_members where group_id = $1 and organization_id = $2',
          [groupId, ctx.organizationId],
        );
        continue;
      }

      const memberIds = parseMemberValues(operation.value);
      memberIds.forEach((memberId) => affected.add(memberId));

      if (operation.op === 'remove') {
        await removeGroupMembers(tx, ctx, groupId, memberIds);
      } else if (operation.op === 'replace') {
        const current = await getScimGroupMembers(tx, ctx, groupId);
        current.forEach((member) => affected.add(member.id));
        await tx.execute(
          'delete from scim_group_members where group_id = $1 and organization_id = $2',
          [groupId, ctx.organizationId],
        );
        await addGroupMembers(tx, ctx, groupId, memberIds);
      } else {
        await addGroupMembers(tx, ctx, groupId, memberIds);
      }
    }

    let rows: ScimGroupRow[];
    try {
      rows = await tx.query<ScimGroupRow>(
        `update scim_groups
          set display_name = $4, external_id = $5, version = version + 1
        where id = $1 and connection_id = $2 and organization_id = $3
        returning ${GROUP_COLUMNS}`,
        [groupId, ctx.connectionId, ctx.organizationId, displayName, externalId],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ScimError(409, `Group ${displayName} already exists`, 'uniqueness');
      }
      throw error;
    }

    const patched = rows[0];
    if (!patched) throw new ScimError(404, `Group ${groupId} not found`);

    await reconcileGroupMembers(tx, ctx, [...affected]);
    return patched;
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'group.updated',
    payload: { scimGroupId: groupId, operations: operations.length },
  });

  return row;
}

export async function deleteScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
): Promise<void> {
  const existing = await getScimGroup(db, ctx, groupId);
  if (!existing) throw new ScimError(404, `Group ${groupId} not found`);

  const members = await getScimGroupMembers(db, ctx, groupId);

  // The delete and the re-reconciliation are one unit. Run apart, a failure in
  // reconciliation left the group row gone while its members kept the elevated
  // role it had mapped — a privilege outliving the only thing that justified
  // it, with nothing left in the schema to explain or revoke it.
  await db.transaction(async (tx) => {
    await tx.execute(
      'delete from scim_groups where id = $1 and connection_id = $2 and organization_id = $3',
      [groupId, ctx.connectionId, ctx.organizationId],
    );

    // Deleting a group can lower the role its members had mapped, so everyone
    // in it is reconciled against the remaining groups.
    await reconcileGroupMembers(
      tx,
      ctx,
      members.map((member) => member.id),
    );
  });

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'group.deprovisioned',
    payload: { scimGroupId: groupId, members: members.length },
  });
}
