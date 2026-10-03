import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { neonConfig, Pool } from '@neondatabase/serverless';
import WebSocket, { WebSocketServer } from 'ws';
import { queryWithStatementTimeout } from '../../src/db-query.js';

const container = `agi-relay-timeout-${randomUUID()}`;
const image = 'postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73';
const pools: Pool[] = [];
let proxy: WebSocketServer | undefined;
const migration = readFileSync(
  new URL('../../../../apps/web/db/neon/0354_signaling_sessions.sql', import.meta.url),
  'utf8',
);
const reversal = readFileSync(
  new URL('../../../../apps/web/db/neon/down/0354_signaling_sessions.down.sql', import.meta.url),
  'utf8',
);

function docker(args: string[], input?: string): string {
  return execFileSync('docker', args, { encoding: 'utf8', input, timeout: 60_000 }).trim();
}

try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--publish',
    '127.0.0.1::6432',
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    image,
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  assert(ready, 'Disposable PostgreSQL did not become ready');
  docker(['exec', container, 'apk', 'add', '--no-cache', 'pgbouncer']);
  docker(
    ['exec', '-i', container, 'sh', '-c', 'cat > /tmp/pgbouncer.ini'],
    [
      '[databases]',
      'fixture = host=127.0.0.1 port=5432 dbname=postgres',
      'fixture_cas = host=127.0.0.1 port=5432 dbname=postgres pool_size=2',
      '[pgbouncer]',
      'listen_addr=0.0.0.0',
      'listen_port=6432',
      'auth_type=trust',
      'auth_file=/tmp/pgbouncer-users',
      'pool_mode=transaction',
      'default_pool_size=1',
      'max_client_conn=20',
      'logfile=/tmp/pgbouncer.log',
      'pidfile=/tmp/pgbouncer.pid',
    ].join('\n') + '\n',
  );
  docker(
    ['exec', '-i', container, 'sh', '-c', 'cat > /tmp/pgbouncer-users'],
    '"postgres" ""\n"relay_fixture_owner" ""\n',
  );
  docker(['exec', '--detach', '--user', 'postgres', container, 'pgbouncer', '/tmp/pgbouncer.ini']);
  const tcpPort = Number(docker(['port', container, '6432/tcp']).split(':').at(-1));
  assert(Number.isInteger(tcpPort) && tcpPort > 0);
  proxy = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  proxy.on('connection', (socket) => {
    const stream = createConnection({ host: '127.0.0.1', port: tcpPort });
    socket.on('message', (data) => stream.write(data as Buffer));
    stream.on('data', (data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
    stream.on('error', () => socket.terminate());
    stream.on('close', () => socket.close());
    socket.on('error', () => stream.destroy());
    socket.on('close', () => stream.destroy());
  });
  await new Promise<void>((resolve) => proxy!.once('listening', resolve));
  const address = proxy.address();
  assert(address && typeof address !== 'string');
  neonConfig.webSocketConstructor = WebSocket;
  neonConfig.wsProxy = () => `127.0.0.1:${address.port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.forceDisablePgSSL = true;
  neonConfig.pipelineConnect = false;
  neonConfig.poolQueryViaFetch = false;
  const pool = new Pool({
    connectionString: 'postgresql://postgres@127.0.0.1/fixture',
    max: 1,
    query_timeout: 1000,
    connectionTimeoutMillis: 1000,
  });
  pool.on('error', () => undefined);
  pools.push(pool);
  const query = (sql: string, timeout = 100) =>
    queryWithStatementTimeout(pool, sql, [], timeout, () => undefined);
  await pool.query('CREATE TABLE timeout_fixture (id integer)');
  const started = Date.now();
  await assert.rejects(query('SELECT pg_sleep(2)'), { code: '57014' });
  assert(Date.now() - started < 1500, 'Server cancellation did not beat the client deadline');
  assert.equal(pool.totalCount, 0, 'Cancelled transaction was returned to the pool');
  assert.equal((await pool.query('SHOW statement_timeout')).rows[0].statement_timeout, '0');
  assert.equal((await query('SHOW statement_timeout')).rows[0].statement_timeout, '100ms');
  assert.equal((await pool.query('SHOW statement_timeout')).rows[0].statement_timeout, '0');
  await assert.rejects(query('INSERT INTO timeout_fixture VALUES (1); SELECT pg_sleep(2)'), {
    code: '57014',
  });
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM timeout_fixture')).rows[0].count,
    0,
  );
  const impatient = new Pool({
    connectionString: 'postgresql://postgres@127.0.0.1/fixture',
    max: 1,
    query_timeout: 80,
    connectionTimeoutMillis: 1000,
  });
  impatient.on('error', () => undefined);
  pools.push(impatient);
  const impatientStages: string[] = [];
  const impatientCheckout = {
    async connect() {
      const client = await impatient.connect();
      return {
        on: client.on.bind(client),
        off: client.off.bind(client),
        release: client.release.bind(client),
        async query(sql: string, params?: unknown[]) {
          impatientStages.push(`start:${sql}`);
          const result = await client.query(sql, params);
          impatientStages.push(`done:${sql}`);
          return result;
        },
      };
    },
  } as unknown as Pick<Pool, 'connect'>;
  await assert.rejects(
    queryWithStatementTimeout(impatientCheckout, 'SELECT pg_sleep(2)', [], 200, () => undefined),
    /Query read timeout/,
  );
  assert.deepEqual(impatientStages, [
    'start:BEGIN',
    'done:BEGIN',
    "start:SELECT set_config('statement_timeout', $1, true)",
    "done:SELECT set_config('statement_timeout', $1, true)",
    'start:SELECT pg_sleep(2)',
  ]);
  assert.equal(impatient.totalCount, 0, 'Client timeout left an active transaction in the pool');
  assert.equal((await query('SELECT 42 AS answer')).rows[0].answer, 42);
  await pool.query('CREATE ROLE app_rls NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('CREATE ROLE relay_fixture_owner LOGIN NOSUPERUSER BYPASSRLS');
  await pool.query('CREATE ROLE relay_fixture_unprivileged NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await pool.query('GRANT USAGE, CREATE ON SCHEMA public TO relay_fixture_owner');
  await pool.query('GRANT USAGE ON SCHEMA public TO app_rls');
  await pool.query('GRANT app_rls TO relay_fixture_owner');
  await pool.query('GRANT USAGE, CREATE ON SCHEMA public TO relay_fixture_unprivileged');
  await pool.query('GRANT relay_fixture_unprivileged TO relay_fixture_owner');
  await pool.query(
    'ALTER DEFAULT PRIVILEGES FOR ROLE relay_fixture_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls',
  );
  const owner = new Pool({
    connectionString: 'postgresql://relay_fixture_owner@127.0.0.1/fixture',
    max: 1,
    query_timeout: 1000,
    connectionTimeoutMillis: 1000,
  });
  owner.on('error', () => undefined);
  pools.push(owner);
  const applyMigrationSql = async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const asApplication = async (sql: string, params: unknown[] = []) => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_rls');
      assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, 'app_rls');
      return await client.query(sql, params);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  };
  assert.deepEqual(
    (await owner.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'))
      .rows[0],
    { rolsuper: false, rolbypassrls: true },
  );
  assert.deepEqual(
    (await owner.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_rls'"))
      .rows[0],
    { rolsuper: false, rolbypassrls: false },
  );
  await owner.query('CREATE TABLE privilege_negative_control (code text PRIMARY KEY)');
  await owner.query(
    "INSERT INTO privilege_negative_control VALUES ('visible-with-default-grants')",
  );
  assert.equal(
    (await asApplication('SELECT count(*)::int AS count FROM privilege_negative_control')).rows[0]
      .count,
    1,
    'The application role must have active default privileges before the migration revokes them',
  );
  const { applyMigrations, ensureMigrationLedger, loadMigrationInventory } =
    await import('../../../../scripts/lib/neon-migrations.mjs');
  const isolatedMigration = loadMigrationInventory().filter(
    (candidate: { filename: string }) => candidate.filename === '0354_signaling_sessions.sql',
  );
  assert.equal(isolatedMigration.length, 1);
  await ensureMigrationLedger(owner);
  await owner.query(`
    CREATE FUNCTION public.reject_fixture_migration_receipt()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'fixture rejected migration receipt';
    END;
    $$;
    CREATE TRIGGER reject_fixture_migration_receipt
      BEFORE INSERT ON public.schema_migrations
      FOR EACH ROW EXECUTE FUNCTION public.reject_fixture_migration_receipt();
  `);
  try {
    await assert.rejects(
      applyMigrations(owner, isolatedMigration, { target: 'local' }),
      /fixture rejected migration receipt/,
    );
    assert.equal(
      (await owner.query("SELECT to_regclass('public.signaling_sessions') AS relation")).rows[0]
        .relation,
      null,
      'A failed ledger insert must roll back the signaling schema',
    );
    assert.equal(
      (await owner.query('SELECT count(*)::int AS count FROM public.schema_migrations')).rows[0]
        .count,
      0,
      'A failed migration must not record its checksum receipt',
    );
  } finally {
    await owner.query(`
      DROP TRIGGER reject_fixture_migration_receipt ON public.schema_migrations;
      DROP FUNCTION public.reject_fixture_migration_receipt();
    `);
  }
  assert.equal(
    (await applyMigrations(owner, isolatedMigration, { target: 'local' })).appliedNow.length,
    1,
  );
  assert.deepEqual(
    (
      await owner.query(
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.signaling_sessions'::regclass",
      )
    ).rows[0],
    { relrowsecurity: true, relforcerowsecurity: true },
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS count FROM pg_policy WHERE polrelid = 'public.signaling_sessions'::regclass",
      )
    ).rows[0].count,
    0,
  );
  for (const privilege of [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
  ]) {
    assert.equal(
      (
        await owner.query(
          "SELECT has_table_privilege('app_rls', 'public.signaling_sessions', $1) AS allowed",
          [privilege],
        )
      ).rows[0].allowed,
      false,
      `The migration must revoke ${privilege} from app_rls`,
    );
  }
  process.env['NEON_DATABASE_URL'] = 'postgresql://relay_fixture_owner@127.0.0.1/fixture_cas';
  const database = await import('../../src/db.js');
  const {
    deleteSessionByCode,
    deleteSessionsForDevice,
    extendSessionExpiry,
    getSessionByCode,
    insertSession,
    listStoredSessionCodes,
    probeDatabase,
    rotatePairCredential,
  } = database;
  assert.equal((await probeDatabase()).ok, true);
  const createdAt = Date.now();
  const expiresAt = createdAt + 60_000;
  const persistedMetadata = { userId: 'fixture-account', desktopDeviceId: randomUUID() };
  assert.equal(
    (await insertSession('fixture-persistence', createdAt, expiresAt, persistedMetadata)).error,
    null,
  );
  assert.deepEqual((await getSessionByCode('fixture-persistence')).data, {
    code: 'fixture-persistence',
    created_at: createdAt,
    expires_at: expiresAt,
    metadata: persistedMetadata,
  });
  assert.deepEqual(
    (await pool.query("SELECT metadata FROM signaling_sessions WHERE code = 'fixture-persistence'"))
      .rows[0].metadata,
    persistedMetadata,
    'A separate database connection must observe the committed session',
  );
  assert.equal(
    (await insertSession('fixture-persistence', createdAt, expiresAt, {})).error?.code,
    '23505',
  );
  assert.equal((await extendSessionExpiry('fixture-persistence', expiresAt + 10_000)).error, null);
  assert.equal((await extendSessionExpiry('fixture-persistence', expiresAt)).error, null);
  assert.equal(
    (await getSessionByCode('fixture-persistence')).data?.expires_at,
    expiresAt + 10_000,
  );
  assert.deepEqual((await listStoredSessionCodes(['fixture-persistence', 'not-stored'])).data, [
    'fixture-persistence',
  ]);
  assert.equal((await getSessionByCode('not-stored')).data, null);
  for (const sql of [
    'SELECT * FROM signaling_sessions',
    `INSERT INTO signaling_sessions VALUES ('forbidden-app-insert', ${createdAt}, ${expiresAt}, '{}')`,
    "UPDATE signaling_sessions SET metadata = '{}'::jsonb",
    'DELETE FROM signaling_sessions',
  ]) {
    await assert.rejects(asApplication(sql), { code: '42501' });
  }
  await owner.query('GRANT SELECT, INSERT, UPDATE, DELETE ON signaling_sessions TO app_rls');
  assert.equal(
    (await asApplication('SELECT count(*)::int AS count FROM signaling_sessions')).rows[0].count,
    0,
  );
  await assert.rejects(
    asApplication('INSERT INTO signaling_sessions VALUES ($1, $2, $3, $4)', [
      'forbidden-app-insert',
      createdAt,
      expiresAt,
      {},
    ]),
    { code: '42501' },
  );
  assert.equal(
    (await asApplication("UPDATE signaling_sessions SET metadata = '{}'::jsonb")).rowCount,
    0,
  );
  assert.equal((await asApplication('DELETE FROM signaling_sessions')).rowCount, 0);
  assert.deepEqual(
    (await getSessionByCode('fixture-persistence')).data?.metadata,
    persistedMetadata,
  );
  await applyMigrationSql();
  assert.deepEqual(
    (await getSessionByCode('fixture-persistence')).data?.metadata,
    persistedMetadata,
  );
  await assert.rejects(asApplication('SELECT * FROM signaling_sessions'), { code: '42501' });
  assert.equal(
    (
      await insertSession('fixture-mobile-device', createdAt, expiresAt, {
        userId: 'fixture-account',
        mobileDeviceId: persistedMetadata.desktopDeviceId,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await insertSession('fixture-other-device', createdAt, expiresAt, {
        userId: 'fixture-account',
        desktopDeviceId: randomUUID(),
      })
    ).error,
    null,
  );
  assert.deepEqual(
    (await deleteSessionsForDevice(persistedMetadata.desktopDeviceId)).data?.sort(),
    ['fixture-mobile-device', 'fixture-persistence'],
  );
  assert.equal((await getSessionByCode('fixture-other-device')).data?.code, 'fixture-other-device');
  assert.equal((await deleteSessionByCode('fixture-other-device')).error, null);
  assert.equal((await getSessionByCode('fixture-other-device')).data, null);
  await owner.query(reversal);
  assert.equal(
    (await owner.query("SELECT to_regclass('public.signaling_sessions') AS relation")).rows[0]
      .relation,
    null,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS count FROM public.schema_migrations WHERE filename = '0354_signaling_sessions.sql'",
      )
    ).rows[0].count,
    0,
  );
  assert.deepEqual(await probeDatabase(), { ok: false, reason: '42P01' });
  await owner.query(
    'CREATE TABLE signaling_sessions (code text PRIMARY KEY, created_at bigint, expires_at bigint, metadata jsonb)',
  );
  await owner.query('INSERT INTO signaling_sessions VALUES ($1, $2, $3, $4)', [
    'legacy-row',
    createdAt,
    expiresAt,
    persistedMetadata,
  ]);
  await assert.rejects(applyMigrationSql(), /columns do not match the relay contract/);
  assert.deepEqual(
    (await owner.query("SELECT metadata FROM signaling_sessions WHERE code = 'legacy-row'")).rows[0]
      .metadata,
    persistedMetadata,
    'An incompatible legacy schema must fail without modifying its existing rows',
  );
  await owner.query('DROP TABLE signaling_sessions');
  const unprivileged = await owner.connect();
  try {
    await unprivileged.query('BEGIN');
    await unprivileged.query('SET LOCAL ROLE relay_fixture_unprivileged');
    assert.deepEqual(
      (
        await unprivileged.query(
          'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
        )
      ).rows[0],
      { rolsuper: false, rolbypassrls: false },
    );
    await assert.rejects(
      unprivileged.query(migration),
      /requires a privileged owner with BYPASSRLS/,
    );
  } finally {
    await unprivileged.query('ROLLBACK');
    unprivileged.release();
  }
  assert.equal(
    (await owner.query("SELECT to_regclass('public.signaling_sessions') AS relation")).rows[0]
      .relation,
    null,
    'A nonprivileged migration attempt must roll back its table creation',
  );
  assert.equal(
    (await applyMigrations(owner, isolatedMigration, { target: 'local' })).appliedNow.length,
    1,
  );
  assert.equal((await probeDatabase()).ok, true);
  const observer = new Pool({
    connectionString: 'postgresql://postgres@127.0.0.1/fixture_cas',
    max: 1,
    query_timeout: 1000,
    connectionTimeoutMillis: 1000,
  });
  observer.on('error', () => undefined);
  pools.push(observer);
  assert.equal((await observer.query('SELECT 1 AS ready')).rows[0].ready, 1);
  const { freshPairCredential } = await import('../../src/pair-token.js');
  const desktopId = randomUUID();
  const mobileId = randomUUID();
  const desktop = freshPairCredential(desktopId);
  const mobile = freshPairCredential(mobileId);
  const session = { code: 'sql-rotation', created_at: Date.now() };
  const reset = async (metadata: Record<string, unknown>, expires = Date.now() + 60_000) => {
    await pool.query('DELETE FROM signaling_sessions');
    await pool.query('INSERT INTO signaling_sessions VALUES ($1, $2, $3, $4)', [
      session.code,
      session.created_at,
      expires,
      metadata,
    ]);
  };
  await reset({
    userId: 'fixture-account',
    desktopPairCredential: desktop,
    desktopDeviceId: desktopId,
  });
  const replacement = freshPairCredential(desktopId);
  const [rotatedDesktop, claimedMobile] = await (async () => {
    const blocker = await pool.connect();
    let transactionOpen = false;
    try {
      await blocker.query('BEGIN');
      transactionOpen = true;
      assert.equal(
        (
          await blocker.query('SELECT code FROM signaling_sessions WHERE code = $1 FOR UPDATE', [
            session.code,
          ])
        ).rowCount,
        1,
      );
      const rotations = Promise.all([
        rotatePairCredential(
          session,
          'desktop',
          'fixture-account',
          desktop,
          replacement,
          desktopId,
        ),
        rotatePairCredential(session, 'mobile', 'fixture-account', null, mobile, mobileId),
      ]);
      let concurrentBackends = 0;
      const observationDeadline = Date.now() + 2000;
      do {
        concurrentBackends = (
          await observer.query(`
            SELECT count(DISTINCT pid)::int AS count
              FROM pg_stat_activity
             WHERE datname = current_database()
               AND usename = 'relay_fixture_owner'
               AND state = 'active'
               AND wait_event_type = 'Lock'
               AND query LIKE 'UPDATE signaling_sessions SET metadata =%'
          `)
        ).rows[0].count;
        if (concurrentBackends === 2) break;
        await delay(25);
      } while (Date.now() < observationDeadline);
      await blocker.query('ROLLBACK');
      transactionOpen = false;
      const results = await rotations;
      assert.equal(
        concurrentBackends,
        2,
        'Credential CAS must overlap on two distinct PostgreSQL backends',
      );
      return results;
    } finally {
      if (transactionOpen) await blocker.query('ROLLBACK');
      blocker.release();
    }
  })();
  assert.equal(rotatedDesktop.error, null);
  assert(rotatedDesktop.data);
  assert.equal(claimedMobile.error, null);
  assert(claimedMobile.data);
  const stored = (await pool.query('SELECT metadata FROM signaling_sessions')).rows[0].metadata;
  assert.deepEqual(stored.desktopPairCredential, replacement);
  assert.deepEqual(stored.mobilePairCredential, mobile);
  assert.equal(stored.mobileDeviceId, mobileId);
  assert.equal(
    (
      await rotatePairCredential(
        session,
        'desktop',
        'fixture-account',
        desktop,
        freshPairCredential(desktopId),
        desktopId,
      )
    ).data,
    null,
  );
  assert.equal(
    (
      await rotatePairCredential(
        session,
        'desktop',
        'other-account',
        replacement,
        freshPairCredential(desktopId),
        desktopId,
      )
    ).data,
    null,
  );
  assert.equal(
    (
      await rotatePairCredential(
        { ...session, created_at: session.created_at - 1 },
        'desktop',
        'fixture-account',
        replacement,
        freshPairCredential(desktopId),
        desktopId,
      )
    ).data,
    null,
  );
  assert.equal(
    (
      await rotatePairCredential(
        session,
        'desktop',
        'fixture-account',
        replacement,
        freshPairCredential(mobileId),
        mobileId,
      )
    ).data,
    null,
  );
  for (const invalid of [null, {}, { deviceId: mobileId }]) {
    await reset({ userId: 'fixture-account', mobilePairCredential: invalid });
    const result = await rotatePairCredential(
      session,
      'mobile',
      'fixture-account',
      null,
      mobile,
      mobileId,
    );
    assert.equal(result.error, null);
    assert.equal(result.data, null);
  }
  await reset({ userId: 'fixture-account' }, Date.now() - 1);
  assert.equal(
    (await rotatePairCredential(session, 'mobile', 'fixture-account', null, mobile, mobileId)).data,
    null,
  );
  await delay(5500);
  process.stdout.write(
    'PASS: canonical signaling migration rolls back a failed ledger insert, preserves sessions on reapply, reverses cleanly, supports real persistence operations and denies app_rls even after DML regrants\n',
  );
  process.stdout.write(
    'PASS: actual PostgreSQL credential CAS preserves concurrent roles and rejects stale, foreign, malformed, mismatched-device and expired claims\n',
  );
  process.stdout.write(
    'PASS: actual Neon driver through transaction-pooled PgBouncer cancels statements, resets settings, rolls back failed writes, destroys timed-out clients and recovers\n',
  );
} finally {
  await Promise.allSettled(pools.map((pool) => pool.end()));
  if (proxy) {
    for (const socket of proxy.clients) socket.terminate();
    await new Promise<void>((resolve) => proxy!.close(() => resolve()));
  }
  docker(['rm', '--force', container]);
}
