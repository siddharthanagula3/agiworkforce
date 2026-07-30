#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { Client } from 'pg';

const RLS_TABLES = [
  'sso_connections',
  'directory_sync_connections',
  'organization_admin_policies',
  'enterprise_audit_events',
  'organization_usage_ledger',
  'support_cases',
  'conversations',
  'messages',
  'chat_messages',
  'device_pairings',
  'agent_approval_requests',
];

function parseTarget(argv) {
  let target = process.env.AGI_RLS_PROBE_TARGET;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--target') {
      target = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!['local', 'ci', 'branch'].includes(target)) {
    throw new Error('RLS probe requires --target local|ci|branch');
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

async function count(client, table) {
  const result = await client.query(`select count(*)::int as count from public.${table}`);
  return result.rows[0]?.count ?? 0;
}

async function expectRlsRejection(client, statement, values) {
  await client.query('SAVEPOINT expected_rls_rejection');
  try {
    await client.query(statement, values);
    await client.query('ROLLBACK TO SAVEPOINT expected_rls_rejection');
    return false;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_rls_rejection');
    return error?.code === '42501';
  }
}

async function cleanup(client, fixture) {
  await client.query('delete from public.agent_approval_requests where user_id = any($1)', [
    fixture.users,
  ]);
  await client.query('delete from public.device_pairings where user_id = any($1)', [fixture.users]);
  await client.query('delete from public.chat_messages where user_id = any($1)', [fixture.users]);
  await client.query('delete from public.conversations where user_id = any($1)', [fixture.users]);
  await client.query('delete from public.organizations where id = any($1::uuid[])', [
    fixture.organizations,
  ]);
}

async function seed(client, fixture) {
  for (let index = 0; index < fixture.users.length; index += 1) {
    const userId = fixture.users[index];
    const organizationId = fixture.organizations[index];
    const conversationId = fixture.conversations[index];
    const suffix = fixture.suffixes[index];

    await client.query(
      `insert into public.organizations (id, name, slug, created_by)
       values ($1, $2, $3, $4)`,
      [organizationId, `RLS Probe ${suffix}`, `rls-probe-${suffix}`, userId],
    );
    await client.query(
      `insert into public.organization_members (organization_id, user_id, role)
       values ($1, $2, 'owner')`,
      [organizationId, userId],
    );
    await client.query(
      `insert into public.sso_connections
         (organization_id, provider_type, domain, metadata_url, created_by)
       values ($1, 'saml', $2, $3, $4)`,
      [
        organizationId,
        `${suffix}.rls-probe.invalid`,
        `https://${suffix}.rls-probe.invalid/metadata`,
        userId,
      ],
    );
    await client.query(
      `insert into public.directory_sync_connections
         (organization_id, provider, directory_id, display_name)
       values ($1, 'generic_scim', $2, $3)`,
      [organizationId, `directory-${suffix}`, `RLS Probe ${suffix}`],
    );
    await client.query(
      'insert into public.organization_admin_policies (organization_id) values ($1)',
      [organizationId],
    );
    await client.query(
      `insert into public.enterprise_audit_events
         (organization_id, actor_user_id, surface, action, resource_type, outcome, severity)
       values ($1, $2, 'web', 'policy.updated', 'policy', 'success', 'info')`,
      [organizationId, userId],
    );
    await client.query(
      `insert into public.organization_usage_ledger
         (organization_id, user_id, privacy_mode, provider, model,
          provider_cost_usd, charged_amount_usd, gross_margin_usd, gross_margin_pct)
       values ($1, $2, 'managed', 'probe', 'probe-model', 0.10, 0.20, 0.10, 0.50)`,
      [organizationId, userId],
    );
    await client.query(
      `insert into public.support_cases
         (organization_id, requester_user_id, subject, description)
       values ($1, $2, 'RLS probe', 'Tenant-isolation fixture')`,
      [organizationId, userId],
    );
    await client.query(
      `insert into public.conversations (id, user_id, title)
       values ($1, $2, 'RLS probe')`,
      [conversationId, userId],
    );
    await client.query(
      `insert into public.messages (conversation_id, role, content)
       values ($1, 'user', 'RLS probe')`,
      [conversationId],
    );
    await client.query(
      `insert into public.chat_messages
         (user_id, conversation_id, role, content)
       values ($1, $2, 'user', 'RLS probe')`,
      [userId, conversationId],
    );
    await client.query(
      `insert into public.device_pairings (user_id, device_id)
       values ($1, $2)`,
      [userId, `device-${suffix}`],
    );
    await client.query(
      `insert into public.agent_approval_requests
         (user_id, desktop_id, agent_id, tool_name, tool_args)
       values ($1, $2, 'probe-agent', 'probe-tool', '{}'::jsonb)`,
      [userId, randomUUID()],
    );
  }
}

async function runProbe(client, fixture, failures) {
  const flags = await client.query(
    `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relname = any($1)`,
    [RLS_TABLES],
  );
  const flagsByTable = new Map(flags.rows.map((row) => [row.relname, row]));
  for (const table of RLS_TABLES) {
    const row = flagsByTable.get(table);
    reportCheck(
      failures,
      row?.relrowsecurity === true && row?.relforcerowsecurity === true,
      `${table} has ENABLE + FORCE RLS`,
    );
  }

  const role = await client.query("select rolbypassrls from pg_roles where rolname = 'app_rls'");
  reportCheck(
    failures,
    role.rows.length === 1 && role.rows[0]?.rolbypassrls === false,
    'app_rls exists without BYPASSRLS',
  );

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE app_rls');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [fixture.users[0]]);
    await client.query("select set_config('request.jwt.claim.org_id', '', true)");

    for (const table of RLS_TABLES) {
      reportCheck(
        failures,
        (await count(client, table)) === 1,
        `${table} exposes only tenant A's seeded row`,
      );
    }

    const crossTenantUpdate = await client.query(
      "update public.conversations set title = 'cross-tenant' where user_id = $1",
      [fixture.users[1]],
    );
    reportCheck(
      failures,
      crossTenantUpdate.rowCount === 0,
      "tenant A cannot update tenant B's conversation",
    );

    reportCheck(
      failures,
      await expectRlsRejection(
        client,
        `insert into public.chat_messages (user_id, role, content)
         values ($1, 'user', 'cross-tenant')`,
        [fixture.users[1]],
      ),
      "tenant A cannot insert tenant B's chat message",
    );

    reportCheck(
      failures,
      await expectRlsRejection(
        client,
        `insert into public.sso_connections
           (organization_id, provider_type, domain, metadata_url, created_by)
         values ($1, 'saml', $2, $3, $4)`,
        [
          fixture.organizations[1],
          `cross-${fixture.suffixes[0]}.rls-probe.invalid`,
          'https://rls-probe.invalid/metadata',
          fixture.users[0],
        ],
      ),
      "tenant A cannot insert an SSO connection into tenant B's organization",
    );
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error('AGI_DATABASE_URL, DATABASE_URL, or NEON_DATABASE_URL must be exported');
  }
  const target = parseTarget(process.argv.slice(2));
  assertTarget(target, connectionString);

  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const fixture = {
    users: [`rls_probe_a_${runId}`, `rls_probe_b_${runId}`],
    organizations: [randomUUID(), randomUUID()],
    conversations: [randomUUID(), randomUUID()],
    suffixes: [`a-${runId}`, `b-${runId}`],
  };
  const failures = [];
  const client = new Client({
    connectionString,
    application_name: 'agiworkforce-rls-probe',
  });

  await client.connect();
  try {
    await seed(client, fixture);
    await runProbe(client, fixture, failures);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // No active transaction is also safe.
    }
    await cleanup(client, fixture);
    await client.end();
  }

  if (failures.length > 0) {
    throw new Error(`RLS probe failed ${failures.length} check(s)`);
  }
  console.log(`RLS probe passed: ${RLS_TABLES.length} tables isolate two seeded tenants`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
