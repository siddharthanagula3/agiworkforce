import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

/**
 * What a connector secret is for. The purpose is the associated data its
 * envelope is bound to, so a ciphertext lifted out of one column cannot be
 * opened as another secret class.
 */
export const CONNECTOR_SECRET_PURPOSES = [
  'custom-connector-auth-header',
  'oauth-client-secret',
  'oauth-code-verifier',
  'oauth-access-token',
  'oauth-refresh-token',
] as const;

export type ConnectorSecretPurpose = (typeof CONNECTOR_SECRET_PURPOSES)[number];

export interface ConnectorSecretColumn {
  readonly table: string;
  readonly column: string;
  readonly keyColumn: string;
  readonly purpose: ConnectorSecretPurpose;
}

/**
 * Every column that holds a purpose-bound connector secret. Both stores were
 * created before the purpose existed (`user_custom_connectors` and the OAuth
 * broker tables), so rows written then carry no associated data and open under
 * any context. This is the list the re-seal walks and the list the guard checks
 * a purpose against, so a new secret class cannot be added without a column to
 * re-seal it in.
 */
export const CONNECTOR_SECRET_COLUMNS: readonly ConnectorSecretColumn[] = [
  {
    table: 'public.user_custom_connectors',
    column: 'auth_header_enc',
    keyColumn: 'id',
    purpose: 'custom-connector-auth-header',
  },
  {
    table: 'public.mcp_oauth_clients',
    column: 'client_secret_enc',
    keyColumn: 'issuer',
    purpose: 'oauth-client-secret',
  },
  {
    table: 'public.connector_oauth_authorizations',
    column: 'code_verifier_enc',
    keyColumn: 'id',
    purpose: 'oauth-code-verifier',
  },
  {
    table: 'public.connector_oauth_grants',
    column: 'access_token_enc',
    keyColumn: 'id',
    purpose: 'oauth-access-token',
  },
  {
    table: 'public.connector_oauth_grants',
    column: 'refresh_token_enc',
    keyColumn: 'id',
    purpose: 'oauth-refresh-token',
  },
];

export interface OpenedConnectorSecret {
  plaintext: string;
  contextBound: boolean;
}

/**
 * The one place that still admits a connector ciphertext carrying no associated
 * data, and the one that reports it. Every caller goes through here so the
 * allowance has a single owner, and it is the same module that ships the job
 * which takes the allowance away.
 */
export function openConnectorSecret(
  ring: KeyRing,
  sealed: string,
  purpose: ConnectorSecretPurpose,
): OpenedConnectorSecret {
  const opened = openEnvelope(ring, sealed, 'hex-triple', {
    value: purpose,
    acceptUnbound: true,
  });
  return { plaintext: opened.plaintext, contextBound: opened.contextBound };
}

export interface ConnectorResealFailure {
  table: string;
  column: string;
  id: string;
  reason: string;
}

export interface ConnectorResealOutcome {
  scanned: number;
  rebound: number;
  alreadyBound: number;
  remaining: number;
  complete: boolean;
  failures: readonly ConnectorResealFailure[];
}

export interface ResealConnectorSecretsInput {
  db: DatabaseAdapter;
  ring: KeyRing;
  columns?: readonly ConnectorSecretColumn[];
  batchSize?: number;
  maxBatches?: number;
}

export const RESEAL_BATCH = 200;
export const RESEAL_MAX_BATCHES = 50;

interface SecretRow {
  key: string;
  sealed: string;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

async function readBatch(
  db: DatabaseAdapter,
  target: ConnectorSecretColumn,
  limit: number,
  after: string | null,
): Promise<readonly SecretRow[]> {
  const params: unknown[] = after === null ? [limit] : [limit, after];
  const cursor = after === null ? '' : `and ${target.keyColumn} > $2 `;
  return db.query<SecretRow>(
    `select ${target.keyColumn}::text as key, ${target.column} as sealed
       from ${target.table}
      where ${target.column} is not null ${cursor}order by ${target.keyColumn}
      limit $1`,
    params,
  );
}

/**
 * Binds every connector secret still sealed without its purpose to that
 * purpose, in place. A row that will not open is recorded and skipped rather
 * than failing the run, and the cursor moves past it, so one unreadable row
 * cannot stall the walk. Until this has run to completion over a deployment's
 * data, `openConnectorSecret` has to keep admitting an unbound ciphertext.
 */
export async function resealConnectorSecrets(
  input: ResealConnectorSecretsInput,
): Promise<ConnectorResealOutcome> {
  const columns = input.columns ?? CONNECTOR_SECRET_COLUMNS;
  const batchSize = input.batchSize ?? RESEAL_BATCH;
  const maxBatches = input.maxBatches ?? RESEAL_MAX_BATCHES;
  const failures: ConnectorResealFailure[] = [];
  let scanned = 0;
  let rebound = 0;
  let alreadyBound = 0;
  let remaining = 0;

  for (const target of columns) {
    let after: string | null = null;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const rows = await readBatch(input.db, target, batchSize, after);
      if (rows.length === 0) break;
      after = rows[rows.length - 1]?.key ?? null;
      scanned += rows.length;

      for (const row of rows) {
        let opened: OpenedConnectorSecret;
        try {
          opened = openConnectorSecret(input.ring, row.sealed, target.purpose);
        } catch (error) {
          failures.push({
            table: target.table,
            column: target.column,
            id: row.key,
            reason: reasonOf(error),
          });
          continue;
        }
        if (opened.contextBound) {
          alreadyBound += 1;
          continue;
        }
        const resealed = sealEnvelope(input.ring, opened.plaintext, 'hex-triple', target.purpose);
        await input.db.execute(
          `update ${target.table}
              set ${target.column} = $1
            where ${target.keyColumn}::text = $2 and ${target.column} = $3`,
          [resealed, row.key, row.sealed],
        );
        rebound += 1;
      }
      if (rows.length < batchSize) break;
    }
  }

  remaining = failures.length;
  return {
    scanned,
    rebound,
    alreadyBound,
    remaining,
    complete: failures.length === 0,
    failures,
  };
}
