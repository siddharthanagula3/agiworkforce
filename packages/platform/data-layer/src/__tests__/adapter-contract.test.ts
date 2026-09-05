/**
 * One behavioural suite, run against every database adapter, so a host swap is
 * provider selection plus credentials rather than a rewrite.
 *
 * Needs a live Postgres. `AGI_DATABASE_CONTRACT_TEST_URL` names it and must be a
 * loopback address: the suite creates and drops a scratch table and binds tenant
 * scopes, so it may never be pointed at a shared or production host. Absent, or
 * pointed elsewhere, each adapter's suite skips with the reason in its title.
 *
 * The Neon driver speaks WebSocket and cannot reach a plain Postgres directly,
 * so its leg additionally needs `AGI_DATABASE_WS_PROXY` pointing at
 * `scripts/dev-db-ws-proxy.mjs`, exactly how the web app reaches the local
 * database today.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseAdapter, DatabaseProvider } from '../types';
import { NeonDatabaseAdapter } from '../adapters/neon';
import { PostgresDatabaseAdapter } from '../adapters/postgres';

const CONTRACT_URL_ENV = 'AGI_DATABASE_CONTRACT_TEST_URL';
const WS_PROXY_ENV = 'AGI_DATABASE_WS_PROXY';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const RLS_ROLE = 'app_rls';
const TENANT_FUNCTION = 'public.current_app_user_id()';

/**
 * Postgres reverts a transaction-local custom setting to the session value, and
 * a placeholder GUC the session has touched holds the empty string rather than
 * becoming undefined again. Both are absence of a tenant: no row carries an
 * empty user id, so the policies still fail closed.
 */
const NO_TENANT_IDENTITY = new Set([null, '']);

/**
 * One connection, so "two scopes on the same pool" is a claim about the same
 * physical socket rather than a coincidence of pool sizing.
 */
const SINGLE_CONNECTION_POOL = 1;

const IDENTIFIER_SUFFIX_LENGTH = 12;
const HEX_IDENTIFIER = /^[0-9a-f]+$/;

function contractConnectionString(): { url: string; reason: string | null } {
  const raw = process.env[CONTRACT_URL_ENV]?.trim();
  if (!raw) {
    return { url: '', reason: `${CONTRACT_URL_ENV} is unset, no live database to test against` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: '', reason: `${CONTRACT_URL_ENV} is not a valid connection string` };
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    return {
      url: '',
      reason: `${CONTRACT_URL_ENV} must name a loopback host, this suite writes to the database`,
    };
  }
  return { url: raw, reason: null };
}

function scratchTableName(): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, IDENTIFIER_SUFFIX_LENGTH);
  if (!HEX_IDENTIFIER.test(suffix)) throw new Error('scratch table suffix is not an identifier');
  return `data_layer_contract_${suffix}`;
}

function unsignedJwt(sub: string): string {
  const segment = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return [segment({ alg: 'none', typ: 'JWT' }), segment({ sub }), ''].join('.');
}

interface AdapterUnderTest {
  provider: DatabaseProvider;
  skipReason: string | null;
  create: (connectionString: string, poolSize: number) => DatabaseAdapter;
}

const { url: contractUrl, reason: sharedSkipReason } = contractConnectionString();

const adaptersUnderTest: AdapterUnderTest[] = [
  {
    provider: 'postgres',
    skipReason: sharedSkipReason,
    create: (connectionString, poolSize) =>
      new PostgresDatabaseAdapter({
        connectionString,
        poolSize,
        unsafeAllowUnverifiedJwtSubject: true,
      }),
  },
  {
    provider: 'neon',
    skipReason:
      sharedSkipReason ??
      (process.env[WS_PROXY_ENV]?.trim()
        ? null
        : `${WS_PROXY_ENV} is unset, the neon driver cannot reach a plain postgres over TCP`),
    create: (connectionString, poolSize) =>
      new NeonDatabaseAdapter({
        connectionString,
        poolSize,
        unsafeAllowUnverifiedJwtSubject: true,
      }),
  },
];

for (const adapterUnderTest of adaptersUnderTest) {
  const { provider, skipReason, create } = adapterUnderTest;
  const title = skipReason
    ? `${provider} adapter contract (skipped: ${skipReason})`
    : `${provider} adapter contract`;

  // llm-guardrail-allow: the skip is an environment gate, not tolerated failure.
  // It fires only when no loopback database is reachable, and the title names why.
  describe.skipIf(skipReason !== null)(title, () => {
    const table = scratchTableName();
    let db: DatabaseAdapter;

    beforeAll(async () => {
      db = create(contractUrl, SINGLE_CONNECTION_POOL);
      await db.execute(`create table ${table} (id text primary key, label text not null)`);
      await db.execute(`grant select, insert, update, delete on ${table} to ${RLS_ROLE}`);
    });

    afterAll(async () => {
      if (!db) return;
      await db.execute(`drop table if exists ${table}`);
      await db.dispose();
    });

    it('round trips a parameterised query', async () => {
      const rows = await db.query<{ value: string; total: number }>(
        'select $1::text as value, $2::int as total',
        ['contract', 7],
      );
      expect(rows).toEqual([{ value: 'contract', total: 7 }]);
    });

    it('binds parameters rather than interpolating them', async () => {
      const injection = "'; drop table pg_class; --";
      const rows = await db.query<{ value: string }>('select $1::text as value', [injection]);
      expect(rows[0]?.value).toBe(injection);
    });

    it('reports the affected row count from execute', async () => {
      const id = randomUUID();
      const inserted = await db.execute(`insert into ${table} (id, label) values ($1, $2)`, [
        id,
        'inserted',
      ]);
      expect(inserted).toBe(1);
      const updated = await db.execute(`update ${table} set label = $2 where id = $1`, [
        id,
        'updated',
      ]);
      expect(updated).toBe(1);
    });

    it('commits a transaction that returns', async () => {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(`insert into ${table} (id, label) values ($1, $2)`, [id, 'committed']);
      });
      const rows = await db.query<{ label: string }>(`select label from ${table} where id = $1`, [
        id,
      ]);
      expect(rows).toEqual([{ label: 'committed' }]);
    });

    it('rolls a transaction back when the callback throws', async () => {
      const id = randomUUID();
      const failure = new Error('contract rollback');
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(`insert into ${table} (id, label) values ($1, $2)`, [id, 'rolled back']);
          throw failure;
        }),
      ).rejects.toBe(failure);
      const rows = await db.query(`select id from ${table} where id = $1`, [id]);
      expect(rows).toEqual([]);
    });

    it('leaves the pool usable after a rolled back transaction', async () => {
      const rows = await db.query<{ value: number }>('select 1::int as value');
      expect(rows).toEqual([{ value: 1 }]);
    });

    it('exposes the bound tenant to the policy helper inside the scope', async () => {
      const subject = `contract-user-${randomUUID()}`;
      const scoped = db.withUser(unsignedJwt(subject));
      const rows = await scoped.query<{ tenant: string | null }>(
        `select ${TENANT_FUNCTION} as tenant`,
      );
      expect(rows[0]?.tenant).toBe(subject);
    });

    it('exposes the bound tenant inside a scoped transaction', async () => {
      const subject = `contract-user-${randomUUID()}`;
      const tenant = await db.withUser(unsignedJwt(subject)).transaction(async (tx) => {
        const rows = await tx.query<{ tenant: string | null }>(
          `select ${TENANT_FUNCTION} as tenant`,
        );
        return rows[0]?.tenant ?? null;
      });
      expect(tenant).toBe(subject);
    });

    it('leaves no tenant identity bound outside the scope', async () => {
      const subject = `contract-user-${randomUUID()}`;
      await db.withUser(unsignedJwt(subject)).query('select 1');
      const rows = await db.query<{ tenant: string | null }>(`select ${TENANT_FUNCTION} as tenant`);
      expect(rows[0]?.tenant).not.toBe(subject);
      expect(NO_TENANT_IDENTITY.has(rows[0]?.tenant ?? null)).toBe(true);
    });

    it('never leaks one tenant into the next scope on the same connection', async () => {
      const first = `contract-first-${randomUUID()}`;
      const second = `contract-second-${randomUUID()}`;

      const firstRows = await db
        .withUser(unsignedJwt(first))
        .query<{ tenant: string | null }>(`select ${TENANT_FUNCTION} as tenant`);
      const secondRows = await db
        .withUser(unsignedJwt(second))
        .query<{ tenant: string | null }>(`select ${TENANT_FUNCTION} as tenant`);

      expect(firstRows[0]?.tenant).toBe(first);
      expect(secondRows[0]?.tenant).toBe(second);
    });

    it('runs scoped statements under the non-bypassing rls role', async () => {
      const rows = await db
        .withUser(unsignedJwt(`contract-user-${randomUUID()}`))
        .query<{ role: string }>('select current_user as role');
      expect(rows[0]?.role).toBe(RLS_ROLE);
    });

    it('refuses to bind an unverified subject without the explicit opt in', () => {
      const guarded = create(contractUrl, SINGLE_CONNECTION_POOL) as unknown as {
        config: { unsafeAllowUnverifiedJwtSubject?: boolean };
      };
      guarded.config.unsafeAllowUnverifiedJwtSubject = false;
      expect(() => (guarded as unknown as DatabaseAdapter).withUser(unsignedJwt('denied'))).toThrow(
        /unsafeAllowUnverifiedJwtSubject/,
      );
    });

    it('rejects queries once disposed', async () => {
      const disposable = create(contractUrl, SINGLE_CONNECTION_POOL);
      await disposable.query('select 1');
      await disposable.dispose();
      await expect(disposable.query('select 1')).rejects.toThrow(/disposed/);
    });
  });
}
