import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { neonConfig, Pool } from '@neondatabase/serverless';
import WebSocket, { WebSocketServer } from 'ws';
import { queryWithStatementTimeout } from '../../src/db-query.js';

const container = `agi-relay-timeout-${randomUUID()}`;
const image = 'postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73';
const pools: Pool[] = [];
let proxy: WebSocketServer | undefined;

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
      docker(['exec', container, 'pg_isready', '-U', 'postgres']);
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
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /tmp/pgbouncer-users'], '"postgres" ""\n');
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
  await pool.query(
    'CREATE TABLE signaling_sessions (code text PRIMARY KEY, created_at bigint, expires_at bigint, metadata jsonb)',
  );
  process.env['NEON_DATABASE_URL'] = 'postgresql://postgres@127.0.0.1/fixture';
  const { rotatePairCredential } = await import('../../src/db.js');
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
  const [rotatedDesktop, claimedMobile] = await Promise.all([
    rotatePairCredential(session, 'desktop', 'fixture-account', desktop, replacement, desktopId),
    rotatePairCredential(session, 'mobile', 'fixture-account', null, mobile, mobileId),
  ]);
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
