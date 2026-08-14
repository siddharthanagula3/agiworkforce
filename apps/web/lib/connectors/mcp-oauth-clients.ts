/**
 * @file Client registrations, keyed by authorization-server issuer (0115).
 *
 * A client registration is a property of (this deployment, that authorization
 * server) — not of a user. Two users connecting to the same MCP server share
 * one registration. Keying by issuer rather than by connector is what makes
 * that sharing correct: several catalog connectors can sit behind one vendor's
 * authorization server, and registering separately for each would be both
 * wasteful and, for servers that rate-limit dynamic registration, fragile.
 *
 * Nothing here decides HOW a client_id was obtained; `mcp-oauth-provider.ts`
 * owns that order (pre-registered → CIMD → dynamic registration). This module
 * only persists the outcome so the next connect reuses it.
 */

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

/**
 * Raised when 0115 has not been applied in this deployment. Callers translate
 * it into "discovery-based connectors are unavailable here" rather than a
 * generic failure, because the difference is actionable: it means run the
 * migration, not debug the vendor.
 */
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
  /** Null for CIMD (the identity is a URL) and for public dynamic clients. */
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

    // An expired client secret cannot authenticate at the token endpoint, so a
    // registration holding one is worse than none: reusing it produces an
    // `invalid_client` the user cannot act on, whereas reporting it absent
    // makes the caller register again.
    if (expiresAt !== null && expiresAt.getTime() <= Date.now()) return null;

    return {
      issuer: row.issuer,
      clientId: row.client_id,
      clientSecret: row.client_secret_enc ? decryptConnectorToken(row.client_secret_enc) : null,
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
        record.clientSecret ? encryptConnectorToken(record.clientSecret) : null,
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

/**
 * Forget a registration. Called when an authorization server rejects the
 * client we hold — a dynamically registered client can be garbage-collected by
 * the vendor, and continuing to present a client_id it no longer recognises
 * fails every subsequent connect until the row is cleared.
 */
export async function deleteMcpOAuthClient(issuer: string): Promise<void> {
  const db = getNeonDb();
  try {
    await db.execute(`delete from public.mcp_oauth_clients where issuer = $1`, [issuer]);
  } catch (error) {
    if (isUndefinedTable(error)) throw new McpOAuthClientStoreUnavailableError();
    throw error;
  }
}
