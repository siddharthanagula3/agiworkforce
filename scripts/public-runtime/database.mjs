import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  applyMigrations,
  loadMigrationInventory,
  verifyMigrations,
} from '../lib/neon-migrations.mjs';
import { assertFixtureDestination, DATABASE_PREFIX, DATABASE_SOCKET, digest } from './proof.mjs';
import { caseDatabaseRole, confineCaseReads } from './database-authority.mjs';

export async function seedPublicFixtures(client, fixture) {
  await client.query('begin');
  try {
    await client.query('insert into public.profiles (id,email,display_name) values ($1,$2,$3)', [
      fixture.owner,
      'public-matrix@example.invalid',
      'Public matrix local fixture',
    ]);
    await client.query(
      `insert into public.shared_sessions (token,owner_id,title,messages,total_messages,visibility,expires_at,created_at)
      values ($1,$2,$3,$4::jsonb,$5,'public',$6,$7)`,
      [
        fixture.session.token,
        fixture.owner,
        fixture.session.title,
        JSON.stringify(fixture.session.messages),
        fixture.session.messages.length,
        fixture.expiresAt,
        fixture.createdAt,
      ],
    );
    await client.query(
      `insert into public.scheduled_task_shares (token,user_id,task_id,snapshot,created_by)
      values ($1,$2,null,$3::jsonb,$2)`,
      [fixture.schedule.token, fixture.owner, JSON.stringify(fixture.schedule.snapshot)],
    );
    await client.query(
      `insert into public.published_artifacts (token,user_id,artifact_id,title,kind,content,visibility,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,'public',$7,$7)`,
      [
        fixture.artifact.token,
        fixture.owner,
        fixture.artifact.id,
        fixture.artifact.title,
        fixture.artifact.kind,
        fixture.artifact.content,
        fixture.createdAt,
      ],
    );
    await client.query(
      `insert into public.plugin_registry_entries
      (id,name,version,description,category,publisher_id,publisher_name,publisher_kind,source,status)
      values ($1,$2,'1.0.0',$3,'testing','public-matrix','Local fixture','first-party','builtin','preview')`,
      [fixture.plugin.id, fixture.plugin.name, fixture.plugin.description],
    );
    for (const [key, value] of [
      [fixture.snapshotKey, [fixture.connector]],
      [fixture.syncKey, { bootstrapComplete: true, lastSyncAt: fixture.createdAt }],
    ]) {
      await client.query(
        `insert into public.mcp_response_cache (method,params_key,partition_key,value,expires_at_ms,scope)
        values ($1,$2,'',$3,$4,'public') on conflict (method,params_key,partition_key)
        do update set value=excluded.value,expires_at_ms=excluded.expires_at_ms,scope=excluded.scope`,
        [key.method, key.params, JSON.stringify(value), Date.parse(fixture.expiresAt)],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function assertOwnedDatabase(client, database, runId) {
  const current = await client.query(
    'select current_database() as name, inet_server_addr() as address',
  );
  if (current.rows[0]?.name !== database || current.rows[0]?.address !== null)
    throw new Error('Fixture connection escaped its owned local socket database');
  const marker = await client.query('select run_id from public.agi_public_proof_ownership');
  if (marker.rows.length !== 1 || marker.rows[0].run_id !== runId)
    throw new Error('Database is not owned by this disposable proof run');
}

async function restrictDatabaseConnections(client) {
  const databases = await client.query('select datname from pg_database');
  for (const row of databases.rows) {
    const identifier = '"' + row.datname.replaceAll('"', '""') + '"';
    await client.query(`revoke connect on database ${identifier} from public`);
  }
}

if (process.argv[1]?.endsWith('/database.mjs')) {
  const input = JSON.parse(readFileSync('/proof-input/fixture.json', 'utf8'));
  const [command, database, cloneName] = process.argv.slice(2);
  const connectionString = `postgres://postgres@localhost/${database}?host=${DATABASE_SOCKET}&sslmode=disable`;
  if (process.env.CI !== 'true' || !/^[a-f0-9]{24}$/.test(input.runId))
    throw new Error('Fixture operations require an explicit isolated CI proof run');
  assertFixtureDestination(connectionString, database);
  const require = createRequire('/app/apps/web/package.json');
  const { Client } = require('pg');
  const client = new Client({ connectionString, application_name: 'agi-public-proof-controller' });
  await client.connect();
  let ended = false;
  try {
    if (command === 'initialize' || command === 'prepare-restore') {
      const current = await client.query(
        'select current_database() as name, inet_server_addr() as address',
      );
      if (
        current.rows[0]?.name !== `${DATABASE_PREFIX}${input.runId}` ||
        current.rows[0]?.address !== null
      )
        throw new Error('Refusing to initialize an unowned database');
      const tables = await client.query(
        "select count(*)::int as count from information_schema.tables where table_schema='public'",
      );
      if (tables.rows[0].count !== 0)
        throw new Error('Proof initialization requires a fresh empty database');
      if (command === 'prepare-restore') {
        if (
          !input.snapshot ||
          input.snapshot.fixtureDigest !== digest(input.fixtures) ||
          !Array.isArray(input.snapshot.roles)
        )
          throw new Error('Invalid template snapshot');
        for (const role of input.snapshot.roles) {
          if (
            !/^[a-z_][a-z0-9_]{0,62}$/.test(role.rolname) ||
            role.rolname === 'postgres' ||
            role.rolname.startsWith('pg_')
          )
            throw new Error('Invalid snapshot role');
          const attributes = [
            ['rolsuper', 'SUPERUSER'],
            ['rolinherit', 'INHERIT'],
            ['rolcreaterole', 'CREATEROLE'],
            ['rolcreatedb', 'CREATEDB'],
            ['rolcanlogin', 'LOGIN'],
            ['rolreplication', 'REPLICATION'],
            ['rolbypassrls', 'BYPASSRLS'],
          ].map(([key, keyword]) => {
            if (typeof role[key] !== 'boolean') throw new Error('Missing snapshot role attributes');
            return `${role[key] ? '' : 'NO'}${keyword}`;
          });
          await client.query(`create role "${role.rolname}" ${attributes.join(' ')}`);
        }
      } else {
        await client.query('create table public.agi_public_proof_ownership (run_id text not null)');
        await client.query('insert into public.agi_public_proof_ownership values ($1)', [
          input.runId,
        ]);
        const migrations = loadMigrationInventory('/proof-migrations');
        await applyMigrations(client, migrations, { target: 'ci' });
        await verifyMigrations(client, migrations);
        await seedPublicFixtures(client, input.fixtures);
        await restrictDatabaseConnections(client);
        await client.query("alter system set log_statement = 'all'");
        await client.query('select pg_reload_conf()');
        process.stdout.write(
          JSON.stringify({
            fixtureDigest: digest(input.fixtures),
            migrationDigest: digest(
              migrations.map(({ filename, checksum }) => ({ filename, checksum })),
            ),
          }),
        );
      }
    } else if (command === 'verify-restore') {
      await assertOwnedDatabase(client, database, input.snapshot.sourceRunId);
      const migrations = loadMigrationInventory('/proof-migrations');
      await verifyMigrations(client, migrations);
      const migrationDigest = digest(
        migrations.map(({ filename, checksum }) => ({ filename, checksum })),
      );
      if (migrationDigest !== input.snapshot.migrationDigest)
        throw new Error('Restored migration chain differs from the observed build');
      await client.query('update public.agi_public_proof_ownership set run_id=$1', [input.runId]);
      await restrictDatabaseConnections(client);
      await client.query("alter system set log_statement = 'all'");
      await client.query('select pg_reload_conf()');
      process.stdout.write(
        JSON.stringify({ fixtureDigest: digest(input.fixtures), migrationDigest }),
      );
    } else {
      await assertOwnedDatabase(client, database, input.runId);
      if (command === 'authorize') {
        const role = caseDatabaseRole(database);
        // The public service reader crosses FORCE RLS; reproduce that authority only in this disposable database.
        await client.query(
          `create role "${role}" login nosuperuser nocreatedb nocreaterole noreplication bypassrls`,
        );
        await client.query(`alter role "${role}" set search_path=public`);
        await client.query(`revoke connect on database "${database}" from public`);
        await client.query(`grant connect on database "${database}" to "${role}"`);
        await client.query(`grant usage on schema public to "${role}"`);
        const readAuthority = await confineCaseReads(client, database, role);
        const result = await client.query(
          `select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
          has_parameter_privilege($1,'log_statement','set') as logging,
          has_database_privilege($1,$2,'connect') as template_connect,
          exists(select 1 from pg_database where datname <> $3 and has_database_privilege($1,datname,'connect')) as other_connect
          from pg_roles where rolname=$1`,
          [role, `${DATABASE_PREFIX}${input.runId}`, database],
        );
        const authority = result.rows[0];
        if (
          !authority ||
          authority.rolsuper ||
          authority.rolcreatedb ||
          authority.rolcreaterole ||
          authority.rolreplication ||
          !authority.rolbypassrls ||
          authority.logging ||
          authority.template_connect ||
          authority.other_connect
        )
          throw new Error('Case database authority is not confined');
        process.stdout.write(JSON.stringify(readAuthority));
      } else if (command === 'clone' || command === 'drop') {
        if (!new RegExp(`^${database}_[0-9]+$`).test(cloneName))
          throw new Error('Invalid proof database clone');
        await client.end();
        ended = true;
        const admin = new Client({
          host: DATABASE_SOCKET,
          database: 'postgres',
          user: 'postgres',
          application_name: 'agi-public-proof-controller',
        });
        await admin.connect();
        try {
          await admin.query(
            command === 'clone'
              ? `create database "${cloneName}" template "${database}"`
              : `drop database "${cloneName}"`,
          );
          if (command === 'drop') await admin.query(`drop role "${caseDatabaseRole(cloneName)}"`);
        } finally {
          await admin.end();
        }
      } else if (command === 'canary') {
        if (!/^[a-z0-9_]+$/.test(cloneName)) throw new Error('Invalid proof canary');
        const role = caseDatabaseRole(database);
        let drained = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          const active = await client.query(
            'select count(*)::int as count from pg_stat_activity where usename=$1',
            [role],
          );
          if (active.rows[0].count === 0) {
            drained = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!drained) throw new Error('Application database sessions did not finish');
        const logging = await client.query(
          "select current_setting('log_statement') as statements, current_setting('log_destination') as destination, current_setting('logging_collector') as collector",
        );
        if (
          logging.rows[0].statements !== 'all' ||
          !logging.rows[0].destination.split(',').includes('jsonlog') ||
          logging.rows[0].collector !== 'on'
        )
          throw new Error('Independent database logging was changed');
        await client.query("set application_name='agi-public-proof-canary'");
        await client.query(`select '${cloneName}'`);
      } else throw new Error('Unknown fixture operation');
    }
  } finally {
    if (!ended) await client.end();
  }
}
