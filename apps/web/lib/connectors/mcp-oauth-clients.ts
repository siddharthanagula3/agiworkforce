import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { decryptConnectorToken, encryptConnectorToken } from '@/lib/custom-connector-crypto';

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

export class McpOAuthClientStoreUnavailableError extends Error {
  constructor() {
    super('MCP OAuth client storage is not available in this environment');
    this.name = 'McpOAuthClientStoreUnavailableError';
  }
}

export type McpClientRegistrationMethod = 'cimd' | 'dynamic';

export interface McpOAuthClientRecord {
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  registrationMethod: McpClientRegistrationMethod;
  clientMetadataUrl: string | null;
  clientSecretExpiresAt: Date | null;
}

export async function getMcpOAuthClient(issuer: string): Promise<McpOAuthClientRecord | null> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{
      issuer: string;
      client_id: string;
      client_secret_enc: string | null;
      registration_method: string;
      client_metadata_url: string | null;
      client_secret_expires_at: string | null;
    }>(
      `select issuer, client_id, client_secret_enc, registration_method,
              client_metadata_url, client_secret_expires_at
         from public.mcp_oauth_clients
        where issuer = $1
        limit 1`,
      [issuer],
    );
    const row = rows[0];
    if (!row) return null;

    const expiresAt = row.client_secret_expires_at ? new Date(row.client_secret_expires_at) : null;

    if (expiresAt !== null && expiresAt.getTime() <= Date.now()) return null;

    return {
      issuer: row.issuer,
      clientId: row.client_id,
      clientSecret: row.client_secret_enc
        ? decryptConnectorToken(row.client_secret_enc, 'oauth-client-secret')
        : null,
      registrationMethod: row.registration_method as McpClientRegistrationMethod,
      clientMetadataUrl: row.client_metadata_url,
      clientSecretExpiresAt: expiresAt,
    };
  } catch (error) {
    if (isUndefinedTable(error)) throw new McpOAuthClientStoreUnavailableError();
    throw error;
  }
}

export async function saveMcpOAuthClient(record: McpOAuthClientRecord): Promise<void> {
  const db = getNeonDb();
  try {
    await db.execute(
      `insert into public.mcp_oauth_clients (
         issuer, client_id, client_secret_enc, registration_method,
         client_metadata_url, client_secret_expires_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, now(), now())
       on conflict (issuer) do update set
         client_id = excluded.client_id,
         client_secret_enc = excluded.client_secret_enc,
         registration_method = excluded.registration_method,
         client_metadata_url = excluded.client_metadata_url,
         client_secret_expires_at = excluded.client_secret_expires_at,
         updated_at = now()`,
      [
        record.issuer,
        record.clientId,
        record.clientSecret
          ? encryptConnectorToken(record.clientSecret, 'oauth-client-secret')
          : null,
        record.registrationMethod,
        record.clientMetadataUrl,
        record.clientSecretExpiresAt?.toISOString() ?? null,
      ],
    );
  } catch (error) {
    if (isUndefinedTable(error)) throw new McpOAuthClientStoreUnavailableError();
    throw error;
  }
}

export async function deleteMcpOAuthClient(issuer: string): Promise<void> {
  const db = getNeonDb();
  try {
    await db.execute(`delete from public.mcp_oauth_clients where issuer = $1`, [issuer]);
  } catch (error) {
    if (isUndefinedTable(error)) throw new McpOAuthClientStoreUnavailableError();
    throw error;
  }
}
