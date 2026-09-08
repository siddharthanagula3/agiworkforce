#!/usr/bin/env node

/**
 * Managed usage lease lifecycle, exercised against a real Postgres.
 *
 * Every other guard over these functions matches regular expressions against
 * migration text, and `credit-service-durability.test.ts` mocks the database.
 * Neither can observe what the functions actually do to a row, which is how a
 * lease that was clamped to an hour and never renewed survived: the SQL that
 * would have had to change reads correctly in isolation.
 *
 * The invariants asserted here are the accounting ones. A turn that is still
 * making provider calls keeps its lease. A turn that stops is reclaimed, once,
 * and refunds once. Recovery is idempotent. No path refunds twice, and the
 * absolute ceiling still expires a wedged turn however many steps it emits.
 */

import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { Client } from 'pg';

const RESERVED_LEASE_SECONDS = 86_400;
const RESERVE_CEILING_SECONDS = 21_600;
const RENEWAL_WINDOW_SECONDS = 3_600;
const ABSOLUTE_CEILING_SECONDS = 86_400;
const SEEDED_CREDIT_CENTS = 100_000;
const ESTIMATE_CENTS = 25;

function parseTarget(argv) {
  let target = process.env.AGI_LEASE_PROBE_TARGET;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--target') {
      target = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!['local', 'ci', 'branch'].includes(target)) {
    throw new Error('Managed usage lease probe requires --target local|ci|branch');
  }
  return target;
}

function databaseUrl() {
  return process.env.AGI_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
}

function isLocalUrl(connectionString) {
  const hostname = new URL(connectionString).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function assertTarget(target, connectionString) {
  if ((target === 'local' || target === 'ci') && !isLocalUrl(connectionString)) {
    throw new Error(`--target ${target} refuses a non-local database host`);
  }
}

function reportCheck(failures, condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
}

function requestHash(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

async function asTenant(client, userId) {
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query("select set_config('request.jwt.claim.org_id', '', false)");
}

async function asPlatform(client) {
  await client.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function seed(client, fixture) {
  await client.query('insert into public.profiles (id) values ($1)', [fixture.userId]);
  await client.query(
    `insert into public.token_credits (
       user_id, period_start, period_end, credits_allocated_cents, credits_used_cents
     ) values ($1, now() - interval '1 day', now() + interval '30 days', $2, 0)`,
    [fixture.userId, SEEDED_CREDIT_CENTS],
  );
}

async function cleanup(client, fixture) {
  await asPlatform(client);
  await client.query(`delete from public.managed_usage_request_extensions where user_id = $1`, [
    fixture.userId,
  ]);
  await client.query('delete from public.managed_usage_requests where user_id = $1', [
    fixture.userId,
  ]);
  await client.query('delete from public.credit_settlement_jobs where user_id = $1', [
    fixture.userId,
  ]);
  await client.query('delete from public.credit_idempotency_keys where user_id = $1', [
    fixture.userId,
  ]);
  await client.query('delete from public.credit_transactions where user_id = $1', [fixture.userId]);
  await client.query('delete from public.token_credits where user_id = $1', [fixture.userId]);
  await client.query('delete from public.profiles where id = $1', [fixture.userId]);
}

async function reserve(client, fixture, key, leaseSeconds) {
  const result = await client.query(
    `select * from public.reserve_managed_usage_request(
       $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::text, $8::integer
     )`,
    [
      fixture.userId,
      key,
      requestHash(key),
      'probe-provider',
      'probe-model',
      ESTIMATE_CENTS,
      `lease-${key}`,
      leaseSeconds,
    ],
  );
  return result.rows[0];
}

async function markProviderStarted(client, fixture, key) {
  const result = await client.query(
    `select * from public.mark_managed_usage_provider_started($1::text, $2::text, $3::text, $4::text)`,
    [fixture.userId, key, requestHash(key), `lease-${key}`],
  );
  return result.rows[0];
}

async function providerStep(client, fixture, key, step) {
  const result = await client.query(
    `select * from public.extend_managed_usage_request_provider_step(
       $1::text, $2::text, $3::text, $4::text, $5::text,
       $6::integer, $7::integer, $8::integer, $9::integer, $10::boolean
     )`,
    [
      fixture.userId,
      key,
      requestHash(key),
      `lease-${key}`,
      `provider:${step}`,
      ESTIMATE_CENTS,
      null,
      null,
      null,
      false,
    ],
  );
  return result.rows[0];
}

async function requestRow(client, fixture, key) {
  const result = await client.query(
    `select id, status, estimated_cost_cents, actual_cost_cents, created_at, lease_expires_at,
            extract(epoch from (lease_expires_at - now()))::int as lease_remaining_seconds,
            extract(epoch from (lease_expires_at - created_at))::int as lease_span_seconds
     from public.managed_usage_requests
     where user_id = $1 and idempotency_key = $2`,
    [fixture.userId, key],
  );
  return result.rows[0];
}

async function expireLease(client, fixture, key) {
  await asPlatform(client);
  await client.query(
    `update public.managed_usage_requests
     set lease_expires_at = now() - interval '1 minute'
     where user_id = $1 and idempotency_key = $2`,
    [fixture.userId, key],
  );
  await asTenant(client, fixture.userId);
}

async function backdateCreation(client, fixture, key, interval) {
  await asPlatform(client);
  await client.query(
    `update public.managed_usage_requests
     set created_at = now() - $3::interval
     where user_id = $1 and idempotency_key = $2`,
    [fixture.userId, key, interval],
  );
  await asTenant(client, fixture.userId);
}

async function recoverStale(client) {
  await asPlatform(client);
  const result = await client.query('select public.recover_stale_managed_usage_requests(500) as n');
  return result.rows[0]?.n ?? 0;
}

async function refundCount(client, fixture, requestId) {
  await asPlatform(client);
  const result = await client.query(
    `select count(*)::int as n from public.credit_settlement_jobs
     where user_id = $1 and idempotency_key = $2`,
    [fixture.userId, `managed-final:${requestId}`],
  );
  return result.rows[0]?.n ?? 0;
}

async function probeInitialLeaseWindow(client, fixture, failures) {
  const key = `probe-initial-${fixture.runId}`;
  const decision = await reserve(client, fixture, key, RESERVED_LEASE_SECONDS);
  reportCheck(
    failures,
    decision?.reservation_decision === 'acquired',
    'a tool-loop turn acquires its reservation',
  );

  const row = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    row.lease_remaining_seconds > RENEWAL_WINDOW_SECONDS,
    `an initial lease outlives one hour (${row.lease_remaining_seconds}s remaining)`,
  );
  reportCheck(
    failures,
    row.lease_remaining_seconds <= RESERVE_CEILING_SECONDS,
    `an initial lease is still bounded (${row.lease_remaining_seconds}s <= ${RESERVE_CEILING_SECONDS}s)`,
  );
}

async function probeStepRenewsLease(client, fixture, failures) {
  const key = `probe-renew-${fixture.runId}`;
  await reserve(client, fixture, key, RESERVED_LEASE_SECONDS);
  await markProviderStarted(client, fixture, key);

  // A turn that has been running for hours: the lease is nearly spent but has
  // not expired, which is exactly the state a long agentic turn reaches.
  await asPlatform(client);
  await client.query(
    `update public.managed_usage_requests
     set lease_expires_at = now() + interval '30 seconds'
     where user_id = $1 and idempotency_key = $2`,
    [fixture.userId, key],
  );
  await asTenant(client, fixture.userId);

  const first = await providerStep(client, fixture, key, 1);
  reportCheck(
    failures,
    first?.extension_decision === 'covered',
    'the first provider operation is covered by the original reservation',
  );

  const afterFirst = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    afterFirst.lease_remaining_seconds >= RENEWAL_WINDOW_SECONDS - 60,
    `a provider step renews the lease (${afterFirst.lease_remaining_seconds}s remaining)`,
  );

  const second = await providerStep(client, fixture, key, 2);
  reportCheck(
    failures,
    second?.extension_decision === 'extended',
    'a later provider operation extends the reservation',
  );

  const replay = await providerStep(client, fixture, key, 2);
  reportCheck(
    failures,
    replay?.extension_decision === 'already_extended',
    'replaying a provider operation does not reserve twice',
  );
}

async function probeLiveTurnSurvivesRecovery(client, fixture, failures) {
  const key = `probe-live-${fixture.runId}`;
  await reserve(client, fixture, key, RESERVED_LEASE_SECONDS);
  await markProviderStarted(client, fixture, key);
  await providerStep(client, fixture, key, 1);

  await recoverStale(client);
  await asTenant(client, fixture.userId);

  const row = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    row.status === 'provider_started',
    'an executing turn is not reclaimed as stale',
  );
}

async function probeAbandonedTurnRecoversOnce(client, fixture, failures) {
  const key = `probe-abandoned-${fixture.runId}`;
  await reserve(client, fixture, key, RESERVED_LEASE_SECONDS);
  await markProviderStarted(client, fixture, key);
  await expireLease(client, fixture, key);

  const before = await requestRow(client, fixture, key);
  await recoverStale(client);
  await asTenant(client, fixture.userId);

  const recovered = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    recovered.status === 'outcome_unknown',
    'an abandoned turn is reclaimed by recovery',
  );

  await recoverStale(client);
  await asTenant(client, fixture.userId);
  reportCheck(
    failures,
    (await refundCount(client, fixture, before.id)) === 1,
    'a second recovery pass does not refund a second time',
  );
  await asTenant(client, fixture.userId);
}

async function probeAbsoluteCeiling(client, fixture, failures) {
  const key = `probe-wedged-${fixture.runId}`;
  await reserve(client, fixture, key, RESERVED_LEASE_SECONDS);
  await markProviderStarted(client, fixture, key);
  await backdateCreation(client, fixture, key, '23 hours 59 minutes');

  await providerStep(client, fixture, key, 1);
  const row = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    row.lease_span_seconds <= ABSOLUTE_CEILING_SECONDS,
    `renewal cannot push a lease past the absolute ceiling (${row.lease_span_seconds}s <= ${ABSOLUTE_CEILING_SECONDS}s)`,
  );

  await backdateCreation(client, fixture, key, '25 hours');
  await providerStep(client, fixture, key, 2);
  await recoverStale(client);
  await asTenant(client, fixture.userId);

  const wedged = await requestRow(client, fixture, key);
  reportCheck(
    failures,
    wedged.status === 'outcome_unknown',
    'a turn wedged past the ceiling still recovers',
  );
}

async function main() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error('AGI_DATABASE_URL, DATABASE_URL, or NEON_DATABASE_URL must be exported');
  }
  const target = parseTarget(process.argv.slice(2));
  assertTarget(target, connectionString);

  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const fixture = { runId, userId: `lease_probe_${runId}` };
  const failures = [];
  const client = new Client({
    connectionString,
    application_name: 'agiworkforce-managed-usage-lease-probe',
  });

  await client.connect();
  try {
    await asPlatform(client);
    await seed(client, fixture);
    await asTenant(client, fixture.userId);

    await probeInitialLeaseWindow(client, fixture, failures);
    await probeStepRenewsLease(client, fixture, failures);
    await probeLiveTurnSurvivesRecovery(client, fixture, failures);
    await probeAbandonedTurnRecoversOnce(client, fixture, failures);
    await probeAbsoluteCeiling(client, fixture, failures);
  } finally {
    try {
      await cleanup(client, fixture);
    } catch (error) {
      console.error(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await client.end();
  }

  if (failures.length > 0) {
    throw new Error(`Managed usage lease probe failed ${failures.length} check(s)`);
  }
  console.log('Managed usage lease probe passed: leases renew, and only abandoned turns recover');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
