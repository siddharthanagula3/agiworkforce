import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  normalizeExternalResourceReference,
  type ExternalResourceReference,
  type ExternalResourceReferenceInput,
  type NormalizedExternalResourceReference,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

export interface ExternalResourceScope {
  userId: string;
  organizationId: string | null;
}

interface ExternalResourceRow {
  id: string;
  kind: ExternalResourceReference['kind'];
  provider: string;
  identity_key: string;
  uri: string;
  external_id: string | null;
  title: string | null;
  version: string | null;
  version_kind: NonNullable<ExternalResourceReference['version']>['kind'] | null;
  access: ExternalResourceReference['access'];
  connector_id: string | null;
  account_key: string | null;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
}

const RETURNED_COLUMNS = `id, kind, provider, identity_key, uri, external_id, title, version,
       version_kind, access, connector_id, account_key, first_seen_at, last_seen_at`;

function isoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function referenceFromRow(row: ExternalResourceRow): ExternalResourceReference {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    identityKey: row.identity_key,
    uri: row.uri,
    externalId: row.external_id,
    title: row.title,
    version:
      row.version && row.version_kind ? { kind: row.version_kind, value: row.version } : null,
    access: row.access,
    connectorId: row.connector_id,
    accountKey: row.account_key,
    firstSeenAt: isoString(row.first_seen_at),
    lastSeenAt: isoString(row.last_seen_at),
  };
}

function storedRecord(reference: NormalizedExternalResourceReference) {
  return {
    kind: reference.kind,
    provider: reference.provider,
    identity_key: reference.identityKey,
    uri: reference.uri,
    external_id: reference.externalId,
    title: reference.title,
    version: reference.version?.value ?? null,
    version_kind: reference.version?.kind ?? null,
    access: reference.access,
    connector_id: reference.connectorId,
    account_key: reference.accountKey,
  };
}

export async function recordExternalResourceReferences(
  db: DatabaseAdapter,
  scope: ExternalResourceScope,
  inputs: readonly ExternalResourceReferenceInput[],
): Promise<ExternalResourceReference[]> {
  const byIdentity = new Map<string, NormalizedExternalResourceReference>();
  for (const input of inputs) {
    const normalized = normalizeExternalResourceReference(input);
    if (normalized.ok) {
      byIdentity.set(normalized.reference.identityKey, normalized.reference);
    } else {
      logger.warn(
        { kind: input.kind, provider: input.provider, reason: normalized.reason },
        '[external-references] a reference was not recorded',
      );
    }
  }
  if (byIdentity.size === 0) return [];

  const rows = await db.query<ExternalResourceRow>(
    `insert into public.external_resource_references (
       user_id, organization_id, kind, provider, identity_key, uri, external_id, title,
       version, version_kind, access, connector_id, account_key
     )
     select $1, $2::uuid, r.kind, r.provider, r.identity_key, r.uri, r.external_id, r.title,
            r.version, r.version_kind, r.access, r.connector_id, r.account_key
       from jsonb_to_recordset($3::jsonb) as r(
              kind text, provider text, identity_key text, uri text, external_id text,
              title text, version text, version_kind text, access text, connector_id text,
              account_key text
            )
     on conflict (user_id, workspace_key, identity_key) do update
        set uri = excluded.uri,
            external_id = coalesce(excluded.external_id, external_resource_references.external_id),
            title = coalesce(excluded.title, external_resource_references.title),
            version = coalesce(excluded.version, external_resource_references.version),
            version_kind = case
              when excluded.version is null then external_resource_references.version_kind
              else excluded.version_kind
            end,
            access = excluded.access,
            connector_id = excluded.connector_id,
            account_key = excluded.account_key,
            last_seen_at = now()
     returning ${RETURNED_COLUMNS}`,
    [
      scope.userId,
      scope.organizationId,
      JSON.stringify([...byIdentity.values()].map(storedRecord)),
    ],
  );
  return rows.map(referenceFromRow);
}
