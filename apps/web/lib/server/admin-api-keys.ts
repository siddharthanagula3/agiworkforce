import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  isOrganizationPermission,
  type OrganizationPermission,
} from '@agiworkforce/types';

import type { ServicePrincipalIdentity } from '@/lib/server/service-principal';

export const ADMIN_API_KEY_PREFIX = 'agiadm_';
const PREFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LENGTH = 8;
const SECRET_BYTES = 32;
const KEY_PATTERN = /^agiadm_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export interface AdminApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: OrganizationPermission[];
  servicePrincipalId: string | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type VerifiedAdminApiKey = ServicePrincipalIdentity;

interface AdminApiKeyRow {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  key_hash?: string;
  scopes: string[];
  service_principal_id: string | null;
  created_by: string | null;
  created_at: string | Date;
  expires_at: string | Date | null;
  last_used_at: string | Date | null;
  revoked_at: string | Date | null;
}

interface VerifiedKeyRow {
  id: string;
  organization_id: string;
  key_hash: string;
  scopes: string[];
  service_principal_id: string | null;
  principal_name: string | null;
  principal_max_scopes: string[] | null;
  principal_disabled_at: string | Date | null;
}

const PUBLIC_COLUMNS =
  'id, organization_id, name, key_prefix, scopes, service_principal_id, created_by, created_at, expires_at, last_used_at, revoked_at';

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function present(row: AdminApiKeyRow): AdminApiKey {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes.filter(isOrganizationPermission),
    servicePrincipalId: row.service_principal_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at) ?? '',
    expiresAt: toIso(row.expires_at),
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
  };
}

export function hashAdminApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function isAdminApiKeyToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(ADMIN_API_KEY_PREFIX);
}

export function generateAdminApiKey(): { key: string; prefix: string } {
  const prefixBytes = randomBytes(PREFIX_LENGTH);
  const prefix = `${ADMIN_API_KEY_PREFIX}${Array.from(
    prefixBytes,
    (byte) => PREFIX_ALPHABET[byte % PREFIX_ALPHABET.length],
  ).join('')}`;
  return { key: `${prefix}_${randomBytes(SECRET_BYTES).toString('base64url')}`, prefix };
}

export function grantableKeyScopes(
  requested: readonly string[],
  creatorPermissions: ReadonlySet<OrganizationPermission>,
): { scopes: OrganizationPermission[]; refused: string[] } {
  const scopes: OrganizationPermission[] = [];
  const refused: string[] = [];
  for (const scope of new Set(requested)) {
    if (
      isOrganizationPermission(scope) &&
      GRANTABLE_ORGANIZATION_PERMISSIONS.includes(scope) &&
      creatorPermissions.has(scope)
    ) {
      scopes.push(scope);
    } else {
      refused.push(scope);
    }
  }
  return { scopes: scopes.sort(), refused };
}

export async function createAdminApiKey(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    name: string;
    scopes: readonly OrganizationPermission[];
    servicePrincipalId: string;
    createdBy: string;
    expiresAt: string | null;
  },
): Promise<{ key: string; record: AdminApiKey }> {
  const { key, prefix } = generateAdminApiKey();
  const [row] = await db.query<AdminApiKeyRow>(
    `insert into public.organization_admin_api_keys
       (organization_id, name, key_prefix, key_hash, scopes, service_principal_id, created_by, expires_at)
     values ($1, $2, $3, $4, $5::text[], $6, $7, $8)
     returning ${PUBLIC_COLUMNS}`,
    [
      input.organizationId,
      input.name,
      prefix,
      hashAdminApiKey(key),
      [...input.scopes],
      input.servicePrincipalId,
      input.createdBy,
      input.expiresAt,
    ],
  );
  if (!row) throw new Error('The workspace API key was not stored.');
  return { key, record: present(row) };
}

export async function listAdminApiKeys(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<AdminApiKey[]> {
  const rows = await db.query<AdminApiKeyRow>(
    `select ${PUBLIC_COLUMNS}
       from public.organization_admin_api_keys
      where organization_id = $1
      order by created_at desc`,
    [organizationId],
  );
  return rows.map(present);
}

export async function revokeAdminApiKey(
  db: DatabaseAdapter,
  organizationId: string,
  keyId: string,
  revokedBy: string,
): Promise<AdminApiKey | null> {
  const [row] = await db.query<AdminApiKeyRow>(
    `update public.organization_admin_api_keys
        set revoked_at = now(), revoked_by = $3
      where organization_id = $1 and id = $2 and revoked_at is null
      returning ${PUBLIC_COLUMNS}`,
    [organizationId, keyId, revokedBy],
  );
  return row ? present(row) : null;
}

export async function verifyAdminApiKey(
  db: DatabaseAdapter,
  token: string,
): Promise<VerifiedAdminApiKey | null> {
  const match = KEY_PATTERN.exec(token);
  if (!match) return null;
  const hash = hashAdminApiKey(token);
  const [row] = await db.query<VerifiedKeyRow>(
    `update public.organization_admin_api_keys k
        set last_used_at = now()
       from public.organization_service_principals p
      where k.key_hash = $1
        and k.revoked_at is null
        and (k.expires_at is null or k.expires_at > now())
        and p.id = k.service_principal_id
      returning k.id, k.organization_id, k.key_hash, k.scopes, k.service_principal_id,
                p.name as principal_name, p.max_scopes as principal_max_scopes,
                p.disabled_at as principal_disabled_at`,
    [hash],
  );
  if (!row?.key_hash || !row.service_principal_id) return null;
  if (row.principal_disabled_at !== null) return null;
  const stored = Buffer.from(row.key_hash, 'hex');
  const presented = Buffer.from(hash, 'hex');
  if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) return null;
  // The key's scopes are bounded by the principal's ceiling at every call, not
  // only at creation, so narrowing a principal narrows keys already in the wild.
  const ceiling = new Set(
    (row.principal_max_scopes ?? []).filter(isOrganizationPermission).filter(isGrantable),
  );
  return {
    kind: 'service_principal',
    principalId: row.service_principal_id,
    keyId: row.id,
    organizationId: row.organization_id,
    name: row.principal_name ?? '',
    scopes: new Set(
      row.scopes
        .filter(isOrganizationPermission)
        .filter(isGrantable)
        .filter((scope) => ceiling.has(scope)),
    ),
  };
}

function isGrantable(scope: OrganizationPermission): boolean {
  return GRANTABLE_ORGANIZATION_PERMISSIONS.includes(scope);
}
