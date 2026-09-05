import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import type {
  ScimGroupRow,
  ScimProvisionedUserRow,
  ProfileRow,
  SSOConnectionRow,
} from '@/lib/server/neon-types';
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

export interface ScimConnectionContext {
  connectionId: string;
  organizationId: string;
  tokenId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const SCIM_SENSITIVE_ATTRIBUTES = new Set(['password', 'currentpassword', 'newpassword']);

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
  const membershipGranted = row.linked_user_id !== null && row.active;

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
      linked: membershipGranted,
      membershipGranted,
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

export type ProvisionedRole = 'admin' | 'member' | 'viewer';

const ROLE_PRECEDENCE: Record<ProvisionedRole, number> = { admin: 3, member: 2, viewer: 1 };

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

async function verifiedDomains(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<ReadonlySet<string>> {
  const rows = await db.query<Pick<SSOConnectionRow, 'domain'>>(
    `select lower(domain) as domain
       from sso_connections
      where organization_id = $1 and domain_verified_at is not null`,
    [organizationId],
  );
  return new Set(rows.map((row) => row.domain));
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function ownsEmailDomain(email: string | null, domains: ReadonlySet<string>): boolean {
  if (!email) return false;
  const domain = emailDomain(email);
  return domain !== null && domains.has(domain);
}

function emailChanged(previous: string | null, next: string | null): boolean {
  return (previous?.toLowerCase() ?? null) !== (next?.toLowerCase() ?? null);
}

async function assertProvisionableEmail(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  email: string | null,
): Promise<void> {
  if (email === null) return;
  if (ownsEmailDomain(email, await verifiedDomains(db, ctx.organizationId))) return;
  throw new ScimError(
    400,
    'Directory sync may only provision users on a domain this organization has verified',
    'invalidValue',
  );
}

async function linkAccount(
  db: DatabaseAdapter,
  row: ScimProvisionedUserRow,
  domains: ReadonlySet<string>,
): Promise<string | null> {
  if (row.linked_user_id) return row.linked_user_id;
  if (!row.email) return null;
  if (!ownsEmailDomain(row.email, domains)) return null;

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

interface PriorMembership {
  user_id: string;
  role: string;
  provisioning_source: string | null;
}

/**
 * Mirrors the `on conflict do update` CASE in the upsert below, so an audit
 * event can be raised from the pre-write state without a second read after
 * the write.
 */
function computeUpsertedRole(
  prior: Pick<PriorMembership, 'role' | 'provisioning_source'> | undefined,
  mappedRole: ProvisionedRole | null,
): string {
  if (!prior) return mappedRole ?? 'member';
  if (prior.role === 'owner') return prior.role;
  if (prior.provisioning_source === 'scim') return mappedRole ?? 'member';
  if (mappedRole === null) return prior.role;
  return mappedRole;
}

async function recordScimMembershipAudit(
  ctx: ScimConnectionContext,
  eventType: 'scim_membership_granted' | 'scim_membership_revoked',
  targetUserId: string,
  role: ProvisionedRole | string | null,
): Promise<void> {
  await recordAuditEvent({
    userId: null,
    eventType,
    organizationId: ctx.organizationId,
    severity: eventType === 'scim_membership_revoked' ? 'warning' : 'info',
    detail: {
      resourceType: 'organization_member',
      resourceId: targetUserId,
      targetUserId,
      ...(role ? { role } : {}),
      ...(ctx.tokenId ? { subjectRef: `scim_token:${ctx.tokenId}` } : {}),
      source: 'scim',
    },
  });
}

type ScimResourceEventType =
  | 'scim_user_provisioned'
  | 'scim_user_updated'
  | 'scim_user_deprovisioned'
  | 'scim_group_provisioned'
  | 'scim_group_updated'
  | 'scim_group_deprovisioned';

async function recordScimResourceAudit(
  ctx: ScimConnectionContext,
  eventType: ScimResourceEventType,
  resourceType: 'scim_provisioned_user' | 'scim_group',
  resourceId: string,
  resourceName: string | null,
  status?: 'active' | 'inactive',
): Promise<void> {
  const deprovisioned =
    eventType === 'scim_user_deprovisioned' || eventType === 'scim_group_deprovisioned';
  await recordAuditEvent({
    userId: null,
    eventType,
    organizationId: ctx.organizationId,
    severity: deprovisioned || status === 'inactive' ? 'warning' : 'info',
    detail: {
      resourceType,
      resourceId,
      ...(resourceName ? { resourceName } : {}),
      ...(status ? { status } : {}),
      ...(ctx.tokenId ? { subjectRef: `scim_token:${ctx.tokenId}` } : {}),
      source: 'scim',
    },
  });
}

export async function reconcileMembership(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  row: ScimProvisionedUserRow,
): Promise<MembershipOutcome> {
  const domains = await verifiedDomains(db, ctx.organizationId);
  const linkedUserId = await linkAccount(db, row, domains);

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
      if (revoked) {
        await invalidateActiveOrganizationCache(linkedUserId);
        await recordScimMembershipAudit(ctx, 'scim_membership_revoked', linkedUserId, null);
      }
    }
    return { linkedUserId, membershipGranted: false, membershipRevoked: revoked, role: null };
  }

  if (!linkedUserId || !ownsEmailDomain(row.email, domains)) {
    return { linkedUserId, membershipGranted: false, membershipRevoked: false, role: null };
  }

  const mappedRole = await resolveMappedRole(db, ctx, row.id);

  const priorRows = await db.query<Pick<PriorMembership, 'role' | 'provisioning_source'>>(
    `select role, provisioning_source from organization_members
      where organization_id = $1 and user_id = $2`,
    [ctx.organizationId, linkedUserId],
  );
  const priorRow = priorRows[0];

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

  const resultingRole = computeUpsertedRole(priorRow, mappedRole);
  if (resultingRole !== priorRow?.role) {
    await recordScimMembershipAudit(ctx, 'scim_membership_granted', linkedUserId, resultingRole);
  }

  return {
    linkedUserId,
    membershipGranted: true,
    membershipRevoked: false,
    role: mappedRole,
  };
}

const USER_COLUMNS = `id, connection_id, organization_id, external_id, user_name, email,
       given_name, family_name, display_name, active, linked_user_id, linked_at,
       raw_attributes, version, created_at, updated_at`;

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

export async function createScimUser(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  input: ParsedScimUser,
  rawBody: Record<string, unknown>,
): Promise<ScimProvisionedUserRow> {
  await assertProvisionableEmail(db, ctx, input.email);

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
  await recordScimResourceAudit(
    ctx,
    'scim_user_provisioned',
    'scim_provisioned_user',
    row.id,
    row.user_name,
  );

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

  if (emailChanged(existing.email, input.email)) {
    await assertProvisionableEmail(db, ctx, input.email);
  }

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

  const revocationWarnings = outcome.membershipRevoked
    ? await revokeCredentialsAfterScimRemoval(db, ctx.organizationId, outcome.linkedUserId)
    : [];

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: row.active ? 'user.updated' : 'user.deactivated',
    userEmail: row.email,
    payload: {
      scimUserId: row.id,
      membershipGranted: outcome.membershipGranted,
      membershipRevoked: outcome.membershipRevoked,
      credentialsRevoked: outcome.membershipRevoked && revocationWarnings.length === 0,
      revocationWarnings,
    },
  });
  await recordScimResourceAudit(
    ctx,
    'scim_user_updated',
    'scim_provisioned_user',
    row.id,
    row.user_name,
    row.active ? 'active' : 'inactive',
  );

  return (await getScimUser(db, ctx, row.id)) ?? row;
}

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

/**
 * Cuts off the live credentials of a member the IdP just removed.
 *
 * Never throws. An IdP treats a non-2xx as a failed deprovision and retries,
 * which would mean re-running a revoke that already succeeded and, worse, would
 * report the whole operation as failed when the membership WAS revoked. What
 * could not be reached is recorded on the sync event instead, where an
 * administrator reviewing the directory log will see it.
 */
async function revokeCredentialsAfterScimRemoval(
  db: DatabaseAdapter,
  organizationId: string,
  linkedUserId: string | null,
): Promise<string[]> {
  if (!linkedUserId) return [];

  try {
    const { getIdentityProvider } = await import('@/lib/server/identity');
    const { deprovisionMember } = await import('@/lib/services/deprovision-service');
    const result = await deprovisionMember(db, getIdentityProvider(), {
      userId: linkedUserId,
      organizationId,
    });
    return result.errors;
  } catch (error) {
    return [
      `Credential revocation did not run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }
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

  if (emailChanged(existing.email, state.email)) {
    await assertProvisionableEmail(db, ctx, state.email);
  }

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

  const revocationWarnings = outcome.membershipRevoked
    ? await revokeCredentialsAfterScimRemoval(db, ctx.organizationId, outcome.linkedUserId)
    : [];

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: row.active ? 'user.updated' : 'user.deactivated',
    userEmail: row.email,
    payload: {
      scimUserId: row.id,
      membershipGranted: outcome.membershipGranted,
      membershipRevoked: outcome.membershipRevoked,
      credentialsRevoked: outcome.membershipRevoked && revocationWarnings.length === 0,
      revocationWarnings,
    },
  });
  await recordScimResourceAudit(
    ctx,
    'scim_user_updated',
    'scim_provisioned_user',
    row.id,
    row.user_name,
    row.active ? 'active' : 'inactive',
  );

  return (await getScimUser(db, ctx, row.id)) ?? row;
}

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
    if (membershipRevoked) {
      await invalidateActiveOrganizationCache(existing.linked_user_id);
      await recordScimMembershipAudit(
        ctx,
        'scim_membership_revoked',
        existing.linked_user_id,
        null,
      );
    }
  }

  await db.execute(
    'delete from scim_provisioned_users where id = $1 and connection_id = $2 and organization_id = $3',
    [userId, ctx.connectionId, ctx.organizationId],
  );

  const revocationWarnings = membershipRevoked
    ? await revokeCredentialsAfterScimRemoval(db, ctx.organizationId, existing.linked_user_id)
    : [];

  await touchConnection(db, ctx);
  await recordSyncEvent(db, ctx, {
    eventType: 'user.deprovisioned',
    userEmail: existing.email,
    payload: {
      scimUserId: userId,
      membershipRevoked,
      credentialsRevoked: membershipRevoked && revocationWarnings.length === 0,
      revocationWarnings,
    },
  });
  await recordScimResourceAudit(
    ctx,
    'scim_user_deprovisioned',
    'scim_provisioned_user',
    userId,
    existing.user_name,
  );
}

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

// Ids travel as one array parameter, so statement arity is fixed at three no
// matter how many members a group has and the 65535-parameter ceiling never
// applies. What chunking still buys is bounded lock duration: an IdP pushing a
// 50k-member group should not hold write locks on scim_group_members for the
// whole set in one statement.
const MEMBER_WRITE_CHUNK = 1000;

function chunkIds(ids: readonly string[], size: number): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    batches.push(ids.slice(index, index + size));
  }
  return batches;
}

async function addGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  if (memberIds.length === 0) return;

  // A malformed id is a 404 and an unknown one a 400, and the per-member lookup
  // this replaces raised whichever came first in the caller's order. Existence
  // is resolved in one round trip, then the input is walked to raise the same
  // error at the same position. Only well-formed ids reach the query, because a
  // non-uuid would fail the array cast rather than simply not match.
  const wellFormed = [...new Set(memberIds.filter((id) => UUID_PATTERN.test(id)))];
  const known = new Set(
    (
      await db.query<{ id: string }>(
        `select id
           from scim_provisioned_users
          where id = any($1::uuid[]) and connection_id = $2 and organization_id = $3`,
        [wellFormed, ctx.connectionId, ctx.organizationId],
      )
    ).map((row) => row.id),
  );

  for (const memberId of memberIds) {
    assertResourceId(memberId, 'User');
    if (!known.has(memberId)) {
      throw new ScimError(400, `Unknown member id ${memberId}`, 'invalidValue');
    }
  }

  for (const batch of chunkIds([...new Set(memberIds)], MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `insert into scim_group_members (group_id, scim_user_id, organization_id)
       select $1, unnest($2::uuid[]), $3
       on conflict (group_id, scim_user_id) do nothing`,
      [groupId, batch, ctx.organizationId],
    );
  }
}

async function removeGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  // The per-member delete never validated the id: a malformed one matched
  // nothing and removed nothing. Filtering preserves that, since a non-uuid
  // cannot equal a uuid column and would only break the array cast.
  const ids = [...new Set(memberIds.filter((id) => UUID_PATTERN.test(id)))];
  if (ids.length === 0) return;

  for (const batch of chunkIds(ids, MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `delete from scim_group_members
        where group_id = $1 and organization_id = $2 and scim_user_id = any($3::uuid[])`,
      [groupId, ctx.organizationId, batch],
    );
  }
}

export async function reconcileGroupMembers(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  scimUserIds: string[],
): Promise<void> {
  if (scimUserIds.length === 0) return;

  // getScimUser validated each id before reading it, so keep that ahead of the
  // batched read. Every caller runs inside a transaction, so raising before the
  // first reconcile rather than partway through leaves the same visible state.
  for (const scimUserId of scimUserIds) assertResourceId(scimUserId, 'User');

  const unique = [...new Set(scimUserIds)];
  const rows = await db.query<ScimProvisionedUserRow>(
    `select ${USER_COLUMNS}
       from scim_provisioned_users
      where id = any($1::uuid[]) and connection_id = $2 and organization_id = $3`,
    [unique, ctx.connectionId, ctx.organizationId],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  const present = unique
    .map((id) => byId.get(id))
    .filter((row): row is ScimProvisionedUserRow => Boolean(row));
  if (present.length === 0) return;

  const domains = await verifiedDomains(db, ctx.organizationId);
  await linkAccountsBatch(db, ctx, present, domains);

  // Inactive users lose non-owner membership; the single-user path issues one
  // delete each, and the predicate is identical here.
  const revoked = present
    .filter((row) => !row.active && row.linked_user_id)
    .map((row) => row.linked_user_id as string);
  const revokedActual =
    revoked.length === 0
      ? []
      : (
          await db.query<{ user_id: string }>(
            `select user_id from organization_members
              where organization_id = $1 and user_id = any($2::text[]) and role <> 'owner'`,
            [ctx.organizationId, revoked],
          )
        ).map((row) => row.user_id);
  for (const batch of chunkIds(revoked, MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `delete from organization_members
        where organization_id = $1
          and user_id = any($2::text[])
          and role <> 'owner'`,
      [ctx.organizationId, batch],
    );
  }
  await Promise.all(revoked.map((userId) => invalidateActiveOrganizationCache(userId)));
  await Promise.all(
    revokedActual.map((userId) =>
      recordScimMembershipAudit(ctx, 'scim_membership_revoked', userId, null),
    ),
  );

  const grantable = present.filter(
    (row) => row.active && row.linked_user_id && ownsEmailDomain(row.email, domains),
  );
  if (grantable.length === 0) return;

  const roles = await resolveMappedRolesBatch(
    db,
    ctx,
    grantable.map((row) => row.id),
  );

  const grantableUserIds = grantable.map((row) => row.linked_user_id as string);
  const priorMemberships = await db.query<PriorMembership>(
    `select user_id, role, provisioning_source from organization_members
      where organization_id = $1 and user_id = any($2::text[])`,
    [ctx.organizationId, grantableUserIds],
  );
  const priorByUser = new Map(priorMemberships.map((row) => [row.user_id, row]));

  // Split on whether a mapped role exists, because the single-user upsert's
  // CASE behaves differently when its role parameter is null: a null leaves a
  // manually-set role alone unless the row is already scim-provisioned. Two
  // statements keep that exactly rather than approximating it with one.
  const withRole = grantable
    .map((row) => ({ userId: row.linked_user_id as string, role: roles.get(row.id) ?? null }))
    .filter((entry): entry is { userId: string; role: ProvisionedRole } => entry.role !== null);
  const withoutRole = grantable
    .filter((row) => (roles.get(row.id) ?? null) === null)
    .map((row) => row.linked_user_id as string);

  for (const batch of chunkEntries(withRole, MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `insert into organization_members
         (organization_id, user_id, role, provisioning_source, provisioned_at)
       select $1, entry.user_id, entry.role, 'scim', now()
         from unnest($2::text[], $3::text[]) as entry(user_id, role)
       on conflict (organization_id, user_id) do update
         set role = case
               when organization_members.role = 'owner' then organization_members.role
               else excluded.role
             end,
             provisioning_source = 'scim',
             provisioned_at = now()`,
      [ctx.organizationId, batch.map((e) => e.userId), batch.map((e) => e.role)],
    );
  }

  for (const batch of chunkIds(withoutRole, MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `insert into organization_members
         (organization_id, user_id, role, provisioning_source, provisioned_at)
       select $1, entry.user_id, 'member', 'scim', now()
         from unnest($2::text[]) as entry(user_id)
       on conflict (organization_id, user_id) do update
         set role = case
               when organization_members.role = 'owner' then organization_members.role
               when organization_members.provisioning_source = 'scim' then 'member'
               else organization_members.role
             end,
             provisioning_source = 'scim',
             provisioned_at = now()`,
      [ctx.organizationId, batch],
    );
  }

  await Promise.all(
    grantable.map((row) => {
      const linkedUserId = row.linked_user_id as string;
      const mappedRole = roles.get(row.id) ?? null;
      const prior = priorByUser.get(linkedUserId);
      const resultingRole = computeUpsertedRole(prior, mappedRole);
      if (resultingRole === prior?.role) return Promise.resolve();
      return recordScimMembershipAudit(ctx, 'scim_membership_granted', linkedUserId, resultingRole);
    }),
  );
}

function chunkEntries<T>(entries: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
}

// The single-user linkAccount resolves one profile by email and writes one row.
// Across a group that was two round trips per unlinked member.
async function linkAccountsBatch(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  rows: ScimProvisionedUserRow[],
  domains: ReadonlySet<string>,
): Promise<void> {
  const pending = rows.filter((row) => !row.linked_user_id && ownsEmailDomain(row.email, domains));
  if (pending.length === 0) return;

  const emails = [...new Set(pending.map((row) => (row.email as string).toLowerCase()))];
  const profiles = await db.query<{ id: string; email: string }>(
    'select id, lower(email) as email from profiles where lower(email) = any($1::text[])',
    [emails],
  );
  const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile.id]));

  const linked = pending
    .map((row) => ({ row, profileId: profileByEmail.get((row.email as string).toLowerCase()) }))
    .filter((entry): entry is { row: ScimProvisionedUserRow; profileId: string } =>
      Boolean(entry.profileId),
    );
  if (linked.length === 0) return;

  for (const batch of chunkEntries(linked, MEMBER_WRITE_CHUNK)) {
    await db.execute(
      `update scim_provisioned_users as target
          set linked_user_id = entry.linked_user_id, linked_at = now()
         from unnest($1::uuid[], $2::text[]) as entry(id, linked_user_id)
        where target.id = entry.id and target.organization_id = $3`,
      [batch.map((e) => e.row.id), batch.map((e) => e.profileId), ctx.organizationId],
    );
  }

  // Mirror the write onto the in-memory rows so the membership step below sees
  // the same linked ids the single-user path would have returned.
  for (const entry of linked) entry.row.linked_user_id = entry.profileId;
}

async function resolveMappedRolesBatch(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  scimUserIds: string[],
): Promise<Map<string, ProvisionedRole | null>> {
  const resolved = new Map<string, ProvisionedRole | null>();
  if (scimUserIds.length === 0) return resolved;

  const rows = await db.query<{ scim_user_id: string; mapped_role: ProvisionedRole | null }>(
    `select m.scim_user_id, g.mapped_role
       from scim_group_members m
       join scim_groups g on g.id = m.group_id
      where m.scim_user_id = any($1::uuid[])
        and m.organization_id = $2
        and g.connection_id = $3`,
    [scimUserIds, ctx.organizationId, ctx.connectionId],
  );

  const grouped = new Map<string, Array<ProvisionedRole | null>>();
  for (const row of rows) {
    const list = grouped.get(row.scim_user_id) ?? [];
    list.push(row.mapped_role);
    grouped.set(row.scim_user_id, list);
  }
  for (const scimUserId of scimUserIds) {
    resolved.set(scimUserId, strongestMappedRole(grouped.get(scimUserId) ?? []));
  }
  return resolved;
}

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
  await recordScimResourceAudit(
    ctx,
    'scim_group_provisioned',
    'scim_group',
    row.id,
    row.display_name,
  );

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
  await recordScimResourceAudit(ctx, 'scim_group_updated', 'scim_group', row.id, row.display_name);

  return row;
}

const GROUP_PATCH_PATHS = new Set(['members', 'displayname', 'externalid']);

const MEMBER_FILTER_VALUE = /value\s+eq\s+(?:"([^"]+)"|'([^']+)')/giu;

/**
 * RFC 7644 §3.5.2.2: `{"op":"remove","path":"members[value eq \"id\"]"}` with no
 * `value` body removes THAT member. Okta, Entra ID and OneLogin all deprovision
 * a single user this way, so treating the filter as absent, which
 * normalizePatchPath does, since it strips `[...]`, turns one removal into
 * "delete every member of this group".
 */
export function parseMemberFilterIds(path: string | undefined): string[] {
  if (!path) return [];
  const bracket = path.match(/\[([^\]]*)\]/u);
  if (!bracket?.[1]) return [];
  const ids: string[] = [];
  for (const match of bracket[1].matchAll(MEMBER_FILTER_VALUE)) {
    const id = match[1] ?? match[2];
    if (!id) continue;
    if (!UUID_PATTERN.test(id)) {
      throw new ScimError(400, `Unknown member id ${id}`, 'invalidValue');
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) {
    throw new ScimError(400, `Unsupported PATCH path "${path}"`, 'invalidPath');
  }
  return ids;
}

export async function patchScimGroup(
  db: DatabaseAdapter,
  ctx: ScimConnectionContext,
  groupId: string,
  operations: ScimPatchOperation[],
): Promise<ScimGroupRow> {
  const existing = await getScimGroup(db, ctx, groupId);
  if (!existing) throw new ScimError(404, `Group ${groupId} not found`);

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

      const filteredIds = normalized === 'members' ? parseMemberFilterIds(operation.path) : [];

      if (operation.op === 'remove' && operation.value === undefined) {
        if (filteredIds.length > 0) {
          filteredIds.forEach((memberId) => affected.add(memberId));
          await removeGroupMembers(tx, ctx, groupId, filteredIds);
          continue;
        }
        const current = await getScimGroupMembers(tx, ctx, groupId);
        current.forEach((member) => affected.add(member.id));
        await tx.execute(
          'delete from scim_group_members where group_id = $1 and organization_id = $2',
          [groupId, ctx.organizationId],
        );
        continue;
      }

      const memberIds =
        filteredIds.length > 0 && operation.value === undefined
          ? filteredIds
          : parseMemberValues(operation.value);
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
  await recordScimResourceAudit(ctx, 'scim_group_updated', 'scim_group', row.id, row.display_name);

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

  await db.transaction(async (tx) => {
    await tx.execute(
      'delete from scim_groups where id = $1 and connection_id = $2 and organization_id = $3',
      [groupId, ctx.connectionId, ctx.organizationId],
    );

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
  await recordScimResourceAudit(
    ctx,
    'scim_group_deprovisioned',
    'scim_group',
    groupId,
    existing.display_name,
  );
}
