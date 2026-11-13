import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { createLocalPostgresTestClient } from '@agiworkforce/data-layer/testing';
import {
  reconcileProjectKnowledgeObject,
  KnowledgeCleanupLeaseLost,
} from '../lib/server/project-knowledge-lifecycle.ts';
import {
  createProjectKnowledgeCleanupPlan,
  sealProjectKnowledgeObject,
} from '../lib/server/project-knowledge-object-storage.ts';
import {
  normalizeProjectKnowledgeKeys,
  KNOWLEDGE_KEY_NORMALIZATION_LIMIT,
} from './lib/project-knowledge-key-normalization.ts';
import { normalizationOptions } from './normalize-project-knowledge-keys.mjs';
import {
  retireProjectKnowledgeFile,
  retireOwnedProject,
  ProjectContentHeldError,
} from '../lib/server/project-deletion.ts';
import { projectContentHoldFunctionSql } from '../lib/services/legal-hold-gate.ts';
import { createDomainSweepers } from '../lib/services/domain-retention-service.ts';
import {
  dispatchProjectKnowledgeCleanup,
  runProjectKnowledgeCleanup,
} from '../lib/server/project-knowledge-cleanup.ts';
import {
  enqueueJob,
  claimJobs,
  completeJob,
  failJob,
  reapExpiredJobLeases,
  pruneFinishedJobs,
  retryDeadJob,
} from '../lib/jobs/job-service.ts';
import { JobCancelledError, acknowledgeJobCancellation } from '../lib/jobs/cancellation.ts';
import { DEFAULT_DATA_REGION, DATA_REGION_IDS } from '@agiworkforce/compliance';
import { topLevelStatements } from '../../../scripts/lib/sql-statements.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const lifecycleMigrationFile = '0419_project_knowledge_object_lifecycle.sql';
const migration = fs.readFileSync(
  path.join(root, 'apps/web/db/neon', lifecycleMigrationFile),
  'utf8',
);
const holdBindings = fs
  .readdirSync(path.join(root, 'apps/web/db/neon'))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .flatMap((name) =>
    topLevelStatements(fs.readFileSync(path.join(root, 'apps/web/db/neon', name), 'utf8'), {
      preserveLiterals: true,
      preserveQuotedIdentifiers: true,
    }).flatMap((sql) => {
      if (
        /^create\s+(?:or\s+replace\s+)?function\s+(?:public|"public")\s*\.\s*(?:app_project_content_held|"app_project_content_held")\s*\(/i.test(
          sql,
        )
      )
        return [{ name, sql }];
      if (
        /app_project_content_held/i.test(sql) &&
        !/^(?:revoke|grant|comment on function)\b/i.test(sql)
      ) {
        throw new Error(`The hold binding must be verified as executable top-level SQL: ${name}`);
      }
      return [];
    }),
  );
const holdBinding = holdBindings.at(-1);
assert(holdBinding);
assert.equal(
  holdBinding.name,
  lifecycleMigrationFile,
  'Advance the isolated fixture before testing a newer hold binding',
);
const normalizeSql = (sql) =>
  sql
    .trim()
    .replace(/^create\s+(?:or\s+replace\s+)?function/i, 'create function')
    .replace(/;$/, '');
assert.equal(
  normalizeSql(holdBinding.sql),
  normalizeSql(projectContentHoldFunctionSql()),
  'The installed hold binding must be generated from its canonical predicate',
);
const directory = fs.mkdtempSync('/tmp/agi-knowledge-pg-');
const data = path.join(directory, 'data');
const socket = path.join(directory, 'socket');
fs.mkdirSync(socket);
const clients = [];
const fixtureTargets = { private: 'fixture/private', public: 'fixture/legacy-public' };
let started = false;
function run(command, args) {
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
async function client(role = 'lifecycle_owner') {
  const connected = createLocalPostgresTestClient({
    host: socket,
    port: 5432,
    database: 'postgres',
    user: process.env.USER,
  });
  await connected.connect();
  clients.push(connected);
  if (role) await connected.query(`set role ${role}`);
  return connected;
}
function fingerprint(key) {
  return createHash('sha256').update(key).digest('hex');
}
async function rejectCode(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}
async function project(db, user = 'user-a', org = null) {
  const id = randomUUID();
  if (org !== null) {
    await db.query(
      'insert into organizations(id,name,slug) values($1::uuid,$2,$2) on conflict(id) do nothing',
      [org, org],
    );
  }
  await db.query('insert into user_projects(id,user_id,organization_id,name) values($1,$2,$3,$4)', [
    id,
    user,
    org,
    'Fixture project',
  ]);
  return id;
}
async function file(db, projectId, key, targets) {
  const id = randomUUID();
  await db.query(
    targets === undefined
      ? 'insert into project_knowledge_files(id,project_id,file_name,storage_uri) values($1,$2,$3,$4)'
      : 'insert into project_knowledge_files(id,project_id,file_name,storage_uri,storage_targets) values($1,$2,$3,$4,$5::jsonb)',
    [
      id,
      projectId,
      'Fixture source',
      key,
      ...(targets === undefined ? [] : [JSON.stringify(targets)]),
    ],
  );
  return id;
}
async function object(db, key) {
  return (
    await db.query('select * from project_knowledge_objects where fingerprint=$1', [
      fingerprint(key),
    ])
  ).rows[0];
}
async function lockWait(observer, waiter, blocker) {
  const start = performance.now();
  while (performance.now() - start < 5000) {
    const result = await observer.query('select $2::int = any(pg_blocking_pids($1)) as blocked', [
      waiter,
      blocker,
    ]);
    if (result.rows[0].blocked) return;
    await delay(10);
  }
  assert.fail('The concurrency instrument never observed the expected database lock');
}
const helper = (filename, name) => {
  const source = fs.readFileSync(path.join(root, 'apps/web/db/neon', filename), 'utf8');
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$;`,
    'i',
  );
  const match = source.match(pattern);
  assert(match, `Missing authoritative helper ${name}`);
  return match[0];
};
async function organizations(connection) {
  await connection.query(
    fs.readFileSync(path.join(root, 'apps/web/db/neon/0015_organizations.sql'), 'utf8'),
  );
  const residency = fs.readFileSync(
    path.join(root, 'apps/web/db/neon/0220_customer_managed_keys_and_data_region.sql'),
    'utf8',
  );
  const statement = residency.match(
    /alter table public\.organizations\s+add column if not exists data_region[\s\S]*?;/i,
  );
  assert(statement);
  await connection.query(statement[0]);
}
function normalizationDb(connection, observe = async () => {}) {
  return {
    async transaction(work) {
      await connection.query('begin');
      const tx = {
        async query(sql, params) {
          const result = await connection.query(sql, params);
          await observe(sql, result);
          return result.rows;
        },
        async execute(sql, params) {
          const result = await connection.query(sql, params);
          await observe(sql, result);
          return result.rowCount;
        },
      };
      try {
        const result = await work(tx);
        await connection.query('commit');
        return result;
      } catch (error) {
        await connection.query('rollback');
        throw error;
      }
    },
  };
}
const fixtureConnection = 'postgresql://fixture:fixture@127.0.0.1/fixture';
assert.equal(normalizationOptions([], { AGI_DATABASE_URL: fixtureConnection }).mode, 'report');
assert.throws(
  () => normalizationOptions(['apply'], { AGI_DATABASE_URL: fixtureConnection }),
  /review/,
);
assert.throws(
  () =>
    normalizationOptions(['apply', '--review', 'a'.repeat(64), '--target', 'production'], {
      AGI_DATABASE_URL: 'postgresql://fixture:fixture@database.example.test/fixture',
    }),
  /confirm-production/,
);
assert.throws(
  () =>
    normalizationOptions(['apply', '--review', 'a'.repeat(64), '--target', 'local'], {
      AGI_DATABASE_URL: 'postgresql://fixture:fixture@database.example.test/fixture',
    }),
  /non-local/,
);
assert.throws(
  () => normalizationOptions(['report', '--review', 'a'.repeat(64)], {}),
  /only with apply/,
);
assert.equal(normalizationOptions(['--help'], {}).help, true);
assert.equal(
  normalizationOptions(
    ['apply', '--review', 'a'.repeat(64), '--target', 'production', '--confirm-production'],
    { AGI_DATABASE_URL: 'postgresql://fixture:fixture@database.example.test/fixture' },
  ).target,
  'production',
);
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    path.join(directory, 'postgres.log'),
    '-o',
    `-k ${socket} -h '' -p 5432 -c unix_socket_permissions=0700`,
    '-w',
    'start',
  ]);
  started = true;
  const admin = await client(null);
  await admin.query(
    'create role lifecycle_owner nologin nobypassrls; create role app_rls nologin nobypassrls; grant usage,create on schema public to lifecycle_owner; grant usage on schema public to app_rls',
  );
  const db = await client();
  await organizations(db);
  await db.query(fs.readFileSync(path.join(root, 'apps/web/db/neon/0006_projects.sql'), 'utf8'));
  await db.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/0035_project_knowledge_file_lifecycle.sql'),
      'utf8',
    ),
  );
  await db.query(
    'alter table user_projects add column organization_id uuid, add column deleted_at timestamptz; alter table project_knowledge_files add column superseded_at timestamptz, add column extracted_text text, add column extracted_at timestamptz, add column version integer default 1, add column supersedes_id uuid; create table schema_migrations(filename text primary key)',
  );
  const chatDefinition = fs
    .readFileSync(path.join(root, 'apps/web/db/neon/0001_mvp_chat.sql'), 'utf8')
    .match(/create table if not exists public\.web_conversations \([\s\S]*?\n\);/)[0];
  await db.query(chatDefinition);
  await db.query('alter table web_conversations add column organization_id uuid');
  await db.query(helper('0037_rls_user_isolation.sql', 'current_app_user_id'));
  await db.query(helper('0073_tenancy_foundation.sql', 'current_app_org_id'));
  await db.query(helper('0073_tenancy_foundation.sql', 'current_app_org_role'));
  await db.query(helper('0073_tenancy_foundation.sql', 'app_row_is_writable'));
  await db.query(
    "create table profiles(id text primary key); insert into profiles(id) values('user-a'),('user-b')",
  );
  await db.query(
    fs.readFileSync(path.join(root, 'apps/web/db/neon/0208_background_jobs.sql'), 'utf8'),
  );
  await db.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/0230_job_origin_region_and_azure_kms.sql'),
      'utf8',
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/0249_background_job_worker_fencing_and_cancellation.sql'),
      'utf8',
    ),
  );
  await db.query(
    'create policy fixture_job_service on background_jobs to lifecycle_owner using(true) with check(true)',
  );
  const holdsMigration = fs.readFileSync(
    path.join(root, 'apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql'),
    'utf8',
  );
  const holdsTable = holdsMigration.match(
    /CREATE TABLE IF NOT EXISTS public\.legal_holds \([\s\S]*?\n\);/,
  )[0];
  await db.query(holdsTable);
  await db.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/0261_legal_hold_custodians_and_resource_scope.sql'),
      'utf8',
    ),
  );
  await db.query(`alter table legal_holds enable row level security; alter table legal_holds force row level security;
    create policy fixture_hold_service on legal_holds to lifecycle_owner using(true) with check(true);
    create policy fixture_custodian_service on legal_hold_custodians to lifecycle_owner using(true) with check(true)`);
  await db.query('grant select on legal_holds, organization_members to app_rls');
  await db.query(holdsMigration.match(/CREATE POLICY legal_holds_admin_read[\s\S]*?;/)[0]);
  await db.query(`alter table user_projects enable row level security; alter table user_projects force row level security;
    alter table project_knowledge_files enable row level security; alter table project_knowledge_files force row level security;
    create policy fixture_project_service on user_projects to lifecycle_owner using(true) with check(true);
    create policy fixture_file_service on project_knowledge_files to lifecycle_owner using(true) with check(true);
    create policy fixture_project_user on user_projects to app_rls using(user_id=public.current_app_user_id() and organization_id is not distinct from public.current_app_org_id()) with check(user_id=public.current_app_user_id() and organization_id is not distinct from public.current_app_org_id());
    create policy fixture_file_user on project_knowledge_files to app_rls using(project_id in(select id from user_projects)) with check(project_id in(select id from user_projects));
    alter table web_conversations enable row level security; alter table web_conversations force row level security;
    create policy fixture_chat_service on web_conversations to lifecycle_owner using(true) with check(true);
    create policy fixture_chat_user on web_conversations to app_rls using(user_id=public.current_app_user_id() and organization_id is not distinct from public.current_app_org_id()) with check(user_id=public.current_app_user_id() and organization_id is not distinct from public.current_app_org_id());
    grant select,update on web_conversations to app_rls;
    grant select,insert,update,delete on user_projects,project_knowledge_files to app_rls; grant usage on schema public to app_rls`);
  const a = await project(db);
  const b = await project(db, 'user-b');
  const orgId = randomUUID();
  const org = await project(db, 'user-a', orgId);
  const initial = await file(db, a, 'knowledge/initial.pdf');
  await file(db, b, 'knowledge/other.pdf');
  await file(db, org, 'knowledge/org.pdf');
  await db.query(migration);
  await admin.query(
    'create role lifecycle_outsider nologin nobypassrls; grant usage on schema public to lifecycle_outsider',
  );
  assert.equal(
    (
      await admin.query(
        "select has_function_privilege('lifecycle_outsider','public.app_project_content_held(uuid,text)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  const outsider = await client('lifecycle_outsider');
  await outsider.query("set request.jwt.claim.sub='user-a'; set request.jwt.claim.org_id=''");
  await rejectCode(
    () => outsider.query('select public.app_project_content_held($1,$2)', [a, 'project_file']),
    '42501',
  );
  assert.equal((await object(db, 'knowledge/initial.pdf')).reference_count, '1');
  assert.deepEqual(
    (await db.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user'))
      .rows[0],
    { rolsuper: false, rolbypassrls: false },
  );
  const scoped = await client('app_rls');
  await scoped.query("set request.jwt.claim.sub='user-a'; set request.jwt.claim.org_id=''");
  assert.deepEqual(
    (
      await scoped.query('select object_key from project_knowledge_objects order by object_key')
    ).rows.map((row) => row.object_key),
    ['knowledge/initial.pdf'],
  );
  await scoped.query('select set_config($1,$2,false)', ['request.jwt.claim.org_id', orgId]);
  assert.deepEqual(
    (await scoped.query('select object_key from project_knowledge_objects')).rows.map(
      (row) => row.object_key,
    ),
    ['knowledge/org.pdf'],
  );
  await rejectCode(
    () => scoped.query('update project_knowledge_objects set reference_count=0'),
    '42501',
  );
  await rejectCode(
    () =>
      scoped.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
        fingerprint('knowledge/initial.pdf'),
        { private: 'fixture/private' },
      ]),
    '42501',
  );
  await rejectCode(
    () => db.query('update user_projects set organization_id=$1 where id=$2', [orgId, a]),
    '23514',
  );
  await rejectCode(() => file(db, b, 'knowledge/initial.pdf'), '23514');
  await rejectCode(() => file(db, a, 'https://fixture.invalid/knowledge/url.pdf'), '23514');

  await scoped.query("set request.jwt.claim.org_id=''");
  const callerFile = await file(scoped, a, 'knowledge/app-role.pdf');
  assert.equal((await object(db, 'knowledge/app-role.pdf')).reference_count, '1');
  await scoped.query('update project_knowledge_files set deleted_at=now() where id=$1', [
    callerFile,
  ]);
  assert.equal((await object(db, 'knowledge/app-role.pdf')).state, 'queued');
  await rejectCode(
    () =>
      scoped.query('update project_knowledge_files set deleted_at=null where id=$1', [callerFile]),
    '23514',
  );
  const cascadeProject = await project(db);
  const cascadeKey = 'knowledge/cascade.pdf';
  await file(db, cascadeProject, cascadeKey);
  await db.query('delete from user_projects where id=$1', [cascadeProject]);
  assert.equal((await object(db, cascadeKey)).state, 'queued');
  assert.equal((await object(db, cascadeKey)).reference_count, '0');
  const changeFile = await file(db, a, 'knowledge/change-old.pdf');
  await db.query('begin');
  await db.query('update project_knowledge_files set storage_uri=$1 where id=$2', [
    'knowledge/change-new.pdf',
    changeFile,
  ]);
  await db.query('rollback');
  assert.equal((await object(db, 'knowledge/change-old.pdf')).reference_count, '1');
  assert.equal(await object(db, 'knowledge/change-new.pdf'), undefined);
  const duplicateSource = fs.readFileSync(
    path.join(root, 'apps/web/app/api/projects/[id]/duplicate/route.ts'),
    'utf8',
  );
  const duplicateSql = duplicateSource.match(
    /const copiedFiles = await tx\.query<\{ id: string \}>\(\s*`([\s\S]*?)`/,
  )[1];
  const provenanceProject = await project(db);
  const provenanceKey = 'knowledge/provenance.pdf';
  const provenanceFile = await file(scoped, provenanceProject, provenanceKey, fixtureTargets);
  assert.deepEqual((await object(db, provenanceKey)).targets, fixtureTargets);
  await rejectCode(() => file(db, b, provenanceKey), '23514');
  await rejectCode(
    () =>
      scoped.query('update project_knowledge_files set storage_targets=$2::jsonb where id=$1', [
        provenanceFile,
        JSON.stringify({ private: 'changed/namespace' }),
      ]),
    '23514',
  );
  await rejectCode(
    () => file(scoped, provenanceProject, provenanceKey, { private: 'changed/namespace' }),
    '23514',
  );
  await rejectCode(
    () => file(scoped, provenanceProject, 'knowledge/initial.pdf', fixtureTargets),
    '23514',
  );
  for (const [index, invalid] of [
    [],
    { '': 'namespace' },
    { private: '' },
    { private: null },
    { private: { nested: true } },
    { private: 'x'.repeat(16_384) },
  ].entries()) {
    await rejectCode(
      () => file(scoped, provenanceProject, `knowledge/invalid-${index}.pdf`, invalid),
      '23514',
    );
  }
  const provenanceCopy = await project(db);
  await db.query(duplicateSql, [provenanceCopy, 'user-a', provenanceProject]);
  assert.equal((await object(db, provenanceKey)).reference_count, '2');
  assert.deepEqual(
    (
      await db.query('select storage_targets from project_knowledge_files where project_id=$1', [
        provenanceCopy,
      ])
    ).rows[0].storage_targets,
    fixtureTargets,
  );
  const left = await client();
  const right = await client();
  const observer = await client(null);
  const leftPid = (await left.query('select pg_backend_pid() as pid')).rows[0].pid;
  const rightPid = (await right.query('select pg_backend_pid() as pid')).rows[0].pid;
  const copyProject = await project(db);
  await left.query('begin');
  await left.query(duplicateSql, [copyProject, 'user-a', a]);
  await right.query('begin');
  const deleting = right.query('update project_knowledge_files set deleted_at=now() where id=$1', [
    initial,
  ]);
  await lockWait(observer, rightPid, leftPid);
  await left.query('commit');
  await deleting;
  await right.query('commit');
  assert.equal((await object(db, 'knowledge/initial.pdf')).reference_count, '1');
  assert.equal((await object(db, 'knowledge/initial.pdf')).state, 'referenced');
  assert.equal(
    (
      await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
        fingerprint('knowledge/initial.pdf'),
        { private: 'fixture/private' },
      ])
    ).rowCount,
    0,
  );

  const sourceProject = await project(db);
  const key = 'knowledge/delete-wins.pdf';
  const original = await file(db, sourceProject, key, fixtureTargets);
  await left.query('begin');
  await left.query('update project_knowledge_files set deleted_at=now() where id=$1', [original]);
  await right.query('begin');
  const rolledBackProject = await project(right);
  const copied = right.query(duplicateSql, [rolledBackProject, 'user-a', sourceProject]).then(
    () => null,
    (error) => error,
  );
  await lockWait(observer, rightPid, leftPid);
  await left.query('commit');
  assert.equal((await copied).code, '23514');
  await right.query('rollback');
  assert.equal(
    (await db.query('select id from user_projects where id=$1', [rolledBackProject])).rowCount,
    0,
  );
  assert.equal((await object(db, key)).state, 'queued');
  await rejectCode(
    () => db.query('update project_knowledge_files set deleted_at=null where id=$1', [original]),
    '23514',
  );

  const repeatProject = await project(db);
  const repeatKey = 'knowledge/repeatable.pdf';
  const repeatFile = await file(db, repeatProject, repeatKey);
  const repeatCopy = await project(db);
  await right.query('begin isolation level repeatable read');
  await right.query('select count(*) from project_knowledge_files');
  await left.query(duplicateSql, [repeatCopy, 'user-a', repeatProject]);
  await rejectCode(
    () =>
      right.query('update project_knowledge_files set deleted_at=now() where id=$1', [repeatFile]),
    '40001',
  );
  await right.query('rollback');
  assert.equal((await object(db, repeatKey)).reference_count, '2');

  const targets = fixtureTargets;
  assert.deepEqual((await object(db, key)).targets, targets);
  assert.equal(
    (
      await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
        fingerprint(key),
        { private: 'changed/before-first-cleanup' },
      ])
    ).rowCount,
    0,
  );
  assert.deepEqual((await object(db, key)).targets, targets);
  const claim = (
    await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
      fingerprint(key),
      targets,
    ])
  ).rows[0];
  assert(claim.claim_token);
  assert.equal(
    (
      await db.query('select record_project_knowledge_object_cleanup($1,$2,$3) as ok', [
        fingerprint(key),
        claim.claim_token,
        'private',
      ])
    ).rows[0].ok,
    true,
  );
  assert.equal((await object(db, key)).state, 'deleting');
  await db.query(
    "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
    [fingerprint(key)],
  );
  assert.equal(
    (
      await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
        fingerprint(key),
        { private: 'wrong/namespace' },
      ])
    ).rowCount,
    0,
  );
  const retry = (
    await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
      fingerprint(key),
      targets,
    ])
  ).rows[0];
  assert.notEqual(retry.claim_token, claim.claim_token);
  assert(retry.receipts.private);
  assert.equal(
    (
      await db.query('select record_project_knowledge_object_cleanup($1,$2,$3) as ok', [
        fingerprint(key),
        claim.claim_token,
        'public',
      ])
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query('select record_project_knowledge_object_cleanup($1,$2,$3) as ok', [
        fingerprint(key),
        retry.claim_token,
        'public',
      ])
    ).rows[0].ok,
    true,
  );
  const finished = await object(db, key);
  assert.equal(finished.state, 'deleted');
  assert.equal(finished.object_key, null);
  assert.equal(finished.user_id, null);
  assert.deepEqual(finished.targets, {});
  await rejectCode(() => file(db, a, key), '23514');
  await rejectCode(
    () =>
      db.query(
        fs.readFileSync(
          path.join(root, 'apps/web/db/neon/down/0419_project_knowledge_object_lifecycle.down.sql'),
          'utf8',
        ),
      ),
    'P0001',
  );
  await db.query('rollback');
  const adapter = { query: async (sql, params) => (await db.query(sql, params)).rows };
  const claimDefinition = migration.match(
    /create function public\.claim_project_knowledge_object_cleanup\([\s\S]*?\$\$;/,
  )[0];
  const unsafeClaim = claimDefinition
    .replace('create function', 'create or replace function')
    .replace(
      "set state = 'deleting', claim_token",
      "set state = 'deleting', targets = target_descriptor, claim_token",
    )
    .replace(
      "and targets <> '{}'::jsonb and target_descriptor @> targets",
      "and (targets = '{}'::jsonb or targets = target_descriptor)",
    );
  assert(unsafeClaim.includes('targets = target_descriptor, claim_token'));
  assert(!unsafeClaim.includes('target_descriptor @> targets'));
  await db.query('begin');
  try {
    await db.query(unsafeClaim);
    let unsafeRemovalReached = false;
    await assert.rejects(
      reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint('knowledge/app-role.pdf'),
        targets: { private: 'wrong-first-cleanup-namespace' },
        leaseSeconds: 60,
        remove: async () => {
          unsafeRemovalReached = true;
          throw new Error('Negative control reached unverified storage; no bytes were touched');
        },
      }),
      /Negative control/,
    );
    assert.equal(unsafeRemovalReached, true);
  } finally {
    await db.query('rollback');
  }
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint('knowledge/app-role.pdf'),
        targets,
        leaseSeconds: 60,
        remove: async () =>
          assert.fail('Unknown original storage must not be guessed during cleanup'),
      })
    ).status,
    'unverified',
  );
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint('knowledge/initial.pdf'),
        targets,
        leaseSeconds: 60,
        remove: async () => assert.fail('Referenced bytes must not be touched'),
      })
    ).status,
    'retained',
  );
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint('knowledge/untracked.pdf'),
        targets,
        leaseSeconds: 60,
        remove: async () => assert.fail('Untracked bytes must not be touched'),
      })
    ).status,
    'untracked',
  );
  async function retired(name, storageTargets = targets) {
    const key = `knowledge/${name}.pdf`;
    const id = await file(db, a, key, storageTargets);
    await db.query('update project_knowledge_files set deleted_at=now() where id=$1', [id]);
    return key;
  }
  const singleTarget = await retired('single-written-target', { private: targets.private });
  const singleCalls = [];
  const singleResult = await reconcileProjectKnowledgeObject(adapter, {
    fingerprint: fingerprint(singleTarget),
    targets,
    leaseSeconds: 60,
    remove: async ({ name }) => singleCalls.push(name),
  });
  assert.equal(singleResult.status, 'deleted');
  assert.deepEqual(singleCalls, ['private']);
  assert.deepEqual(Object.keys((await object(db, singleTarget)).receipts), ['private']);
  const partialKey = await retired('partial-receipts');
  const calls = [];
  const live = new Map([
    ['private', new Set([partialKey])],
    ['public', new Set([partialKey])],
  ]);
  let failPublic = true;
  const remove = async ({ name, objectKey, location }) => {
    assert.equal(location, targets[name]);
    calls.push(name);
    if (name === 'public' && failPublic) {
      failPublic = false;
      throw new Error('synthetic public target failure');
    }
    live.get(name).delete(objectKey);
  };
  await assert.rejects(
    reconcileProjectKnowledgeObject(adapter, {
      fingerprint: fingerprint(partialKey),
      targets,
      leaseSeconds: 60,
      remove,
    }),
    /synthetic public/,
  );
  const partial = await object(db, partialKey);
  assert.equal(partial.state, 'deleting');
  assert(partial.receipts.private);
  assert.equal(partial.receipts.public, undefined);
  assert.equal(live.get('private').size, 0);
  assert.equal(live.get('public').size, 1);
  await db.query(
    "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
    [fingerprint(partialKey)],
  );
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint(partialKey),
        targets,
        leaseSeconds: 60,
        remove,
      })
    ).status,
    'deleted',
  );
  assert.deepEqual(calls, ['private', 'public', 'public']);
  const lostKey = await retired('lost-storage-receipt', { private: targets.private });
  let exists = true;
  let lost = true;
  let deleteCalls = 0;
  const loseReceipt = async () => {
    deleteCalls++;
    exists = false;
    if (lost) {
      lost = false;
      throw new Error('synthetic lost storage acknowledgement');
    }
  };
  await assert.rejects(
    reconcileProjectKnowledgeObject(adapter, {
      fingerprint: fingerprint(lostKey),
      targets: { private: targets.private },
      leaseSeconds: 60,
      remove: loseReceipt,
    }),
    /lost storage/,
  );
  assert.equal(exists, false);
  assert.deepEqual((await object(db, lostKey)).receipts, {});
  await db.query(
    "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
    [fingerprint(lostKey)],
  );
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint(lostKey),
        targets: { private: targets.private },
        leaseSeconds: 60,
        remove: loseReceipt,
      })
    ).status,
    'deleted',
  );
  assert.equal(deleteCalls, 2);
  const staleKey = await retired('lease-lost-during-storage', { private: targets.private });
  await assert.rejects(
    reconcileProjectKnowledgeObject(adapter, {
      fingerprint: fingerprint(staleKey),
      targets: { private: targets.private },
      leaseSeconds: 60,
      remove: async () => {
        await db.query(
          "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
          [fingerprint(staleKey)],
        );
        await db.query('select * from claim_project_knowledge_object_cleanup($1,$2,60)', [
          fingerprint(staleKey),
          { private: targets.private },
        ]);
      },
    }),
    KnowledgeCleanupLeaseLost,
  );
  assert.equal((await object(db, staleKey)).state, 'deleting');
  const previousDirectory = process.cwd();
  const storageEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      /^(?:AGI_STORAGE_|CLOUDFLARE_R2_|NODE_ENV$)/.test(name),
    ),
  );
  const clearStorageEnvironment = () => {
    for (const name of Object.keys(process.env)) {
      if (/^(?:AGI_STORAGE_|CLOUDFLARE_R2_|NODE_ENV$)/.test(name)) delete process.env[name];
    }
  };
  let localPlan;
  let movedPlan;
  let localSealed;
  const localBytes = Buffer.from('isolated real file contents');
  try {
    clearStorageEnvironment();
    process.env.NODE_ENV = 'development';
    process.chdir(directory);
    localPlan = createProjectKnowledgeCleanupPlan();
    localSealed = await sealProjectKnowledgeObject({
      key: `knowledge-files/projects/${a}/partial.txt`,
      etag: createHash('sha256').update(localBytes).digest('hex'),
      bytes: localBytes,
      contentType: 'text/plain',
    });
    const moved = path.join(directory, 'changed-working-directory');
    fs.mkdirSync(moved);
    process.chdir(moved);
    movedPlan = createProjectKnowledgeCleanupPlan();
  } finally {
    process.chdir(previousDirectory);
    clearStorageEnvironment();
    Object.assign(process.env, storageEnvironment);
  }
  assert(localSealed);
  assert.deepEqual(localSealed.targets, localPlan.targets);
  const registrationSource = fs.readFileSync(
    path.join(root, 'apps/web/lib/server/project-knowledge-files.ts'),
    'utf8',
  );
  const registrationSql = registrationSource.match(
    /const \[inserted\] = await db\.query<Record<string, unknown>>\(\s*`([\s\S]*?)`/,
  )[1];
  const localKey = localSealed.key;
  const [registered] = (
    await db.query(registrationSql, [
      a,
      'partial.txt',
      'text/plain',
      localBytes.byteLength,
      createHash('sha256').update(localBytes).digest('hex'),
      null,
      'web',
      'user-a',
      localKey,
      'isolated fixture text',
      1,
      null,
      JSON.stringify(localSealed.targets),
    ])
  ).rows;
  const localFile = registered.id;
  assert.deepEqual((await object(db, localKey)).targets, localSealed.targets);
  const bytesPath = path.join(localPlan.targets['local-bytes'], localKey);
  const metadataPath = path.join(localPlan.targets['local-metadata'], `${localKey}.json`);
  assert.deepEqual(fs.readFileSync(bytesPath), localBytes);
  fs.unlinkSync(metadataPath);
  fs.mkdirSync(metadataPath);
  await db.query('update project_knowledge_files set deleted_at=now() where id=$1', [localFile]);
  await assert.rejects(
    reconcileProjectKnowledgeObject(adapter, {
      fingerprint: fingerprint(localKey),
      ...localPlan,
      leaseSeconds: 60,
    }),
    (error) => ['EISDIR', 'EPERM'].includes(error.code),
  );
  assert.equal(fs.existsSync(bytesPath), false);
  assert.equal(fs.statSync(metadataPath).isDirectory(), true);
  const localPartial = await object(db, localKey);
  assert.equal(localPartial.state, 'deleting');
  assert(localPartial.receipts['local-bytes']);
  assert.equal(localPartial.receipts['local-metadata'], undefined);
  assert.notEqual(
    (await db.query('select deleted_at from project_knowledge_files where id=$1', [localFile]))
      .rows[0].deleted_at,
    null,
  );
  await db.query(
    "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
    [fingerprint(localKey)],
  );
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint(localKey),
        ...movedPlan,
        leaseSeconds: 60,
      })
    ).status,
    'namespace-changed',
  );
  fs.rmdirSync(metadataPath);
  assert.equal(
    (
      await reconcileProjectKnowledgeObject(adapter, {
        fingerprint: fingerprint(localKey),
        ...localPlan,
        leaseSeconds: 60,
      })
    ).status,
    'deleted',
  );
  assert.equal(fs.existsSync(metadataPath), false);
  assert.equal((await object(db, localKey)).object_key, null);
  function queueDb(connection, observe) {
    return {
      query: async (sql, params) => (await connection.query(sql, params)).rows,
      execute: async (sql, params) => (await connection.query(sql, params)).rowCount,
      transaction: normalizationDb(connection, observe).transaction,
    };
  }
  const queue = queueDb(db);
  const otherRegion = DATA_REGION_IDS.find((region) => region !== DEFAULT_DATA_REGION);
  assert(otherRegion);
  try {
    clearStorageEnvironment();
    process.env.NODE_ENV = 'development';
    process.chdir(directory);
    await db.query(
      "update project_knowledge_objects set lease_expires_at=clock_timestamp()+interval '1 hour' where state='deleting' and cleanup_job_id is null",
    );
    async function jobSource(name, owner = 'user-a', org = null, region = null, retire = true) {
      const projectId = await project(db, owner, org);
      if (org !== null)
        await db.query('update organizations set data_region=$2 where id=$1', [org, region]);
      const bytes = Buffer.from(`fixture ${name}`);
      const sealed = await sealProjectKnowledgeObject({
        key: `knowledge-files/projects/${projectId}/${name}.txt`,
        bytes,
        etag: createHash('sha256').update(bytes).digest('hex'),
        contentType: 'text/plain',
      });
      assert(sealed);
      const [row] = (
        await db.query(registrationSql, [
          projectId,
          `${name}.txt`,
          'text/plain',
          bytes.byteLength,
          createHash('sha256').update(bytes).digest('hex'),
          null,
          'web',
          owner,
          sealed.key,
          name,
          1,
          null,
          JSON.stringify(sealed.targets),
        ])
      ).rows;
      if (retire)
        assert.equal(
          await retireProjectKnowledgeFile(queue, {
            projectId,
            userId: owner,
            organizationId: org,
            fileId: row.id,
          }),
          true,
        );
      return {
        projectId,
        fileId: row.id,
        key: sealed.key,
        fingerprint: fingerprint(sealed.key),
        bytes: path.join(sealed.targets['local-bytes'], sealed.key),
        metadata: path.join(sealed.targets['local-metadata'], `${sealed.key}.json`),
      };
    }
    const home = await jobSource('outbox-home');
    const failedLink = {
      ...queue,
      transaction: (work) =>
        queue.transaction((tx) =>
          work({
            ...tx,
            execute: async (sql, params) => {
              const changed = await tx.execute(sql, params);
              return sql.includes('cleanup_job_id=$2') ? 0 : changed;
            },
          }),
        ),
    };
    await assert.rejects(
      dispatchProjectKnowledgeCleanup(failedLink, { region: DEFAULT_DATA_REGION }),
      /not linked/,
    );
    assert.equal((await object(db, home.key)).cleanup_job_id, null);
    assert.equal(
      (await db.query('select count(*) as count from background_jobs')).rows[0].count,
      '0',
    );
    const parallel = await client();
    let releaseDispatch;
    let sawLocked;
    const held = new Promise((resolve) => {
      releaseDispatch = resolve;
    });
    const acquired = new Promise((resolve) => {
      sawLocked = resolve;
    });
    let lostDispatchAcknowledgement = false;
    const dispatchConnection = {
      async query(sql, params) {
        const result = await db.query(sql, params);
        if (sql === 'commit' && !lostDispatchAcknowledgement) {
          lostDispatchAcknowledgement = true;
          throw new Error('synthetic lost cleanup dispatch acknowledgement');
        }
        return result;
      },
    };
    const lockedQueue = queueDb(dispatchConnection, async (sql) => {
      if (sql.includes('for update skip locked')) {
        sawLocked();
        await held;
      }
    });
    const firstDispatch = dispatchProjectKnowledgeCleanup(lockedQueue, {
      region: DEFAULT_DATA_REGION,
    });
    firstDispatch.catch(() => {});
    try {
      await Promise.race([
        acquired,
        delay(5000).then(() => assert.fail('No cleanup row lock was observed')),
      ]);
      assert.equal(
        await dispatchProjectKnowledgeCleanup(queueDb(parallel), { region: DEFAULT_DATA_REGION }),
        0,
      );
    } finally {
      releaseDispatch();
    }
    await assert.rejects(firstDispatch, /lost cleanup dispatch acknowledgement/);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 0);
    const [queued] = (await db.query('select * from background_jobs')).rows;
    assert.equal(queued.user_id, null);
    assert.equal(queued.organization_id, null);
    assert.equal(queued.tenant_key, 'platform');
    assert.equal(queued.payload.fingerprint, home.fingerprint);
    assert(!JSON.stringify(queued.payload).includes(home.key));
    await rejectCode(
      () =>
        enqueueJob(queueDb(scoped), {
          kind: 'data-deletion.project-knowledge-object',
          idempotencyKey: `forged:${home.fingerprint}`,
          payload: { fingerprint: home.fingerprint },
          originRegion: DEFAULT_DATA_REGION,
        }),
      '42501',
    );
    const claim = async (region, workerId) =>
      (await claimJobs(queue, { queues: ['data-deletion'], limit: 1, region, workerId }))[0];
    const jobContext = (job) => ({
      db: queue,
      job,
      signal: new globalThis.AbortController().signal,
      isFinalAttempt: false,
    });
    let homeJob = await claim(DEFAULT_DATA_REGION, 'fixture-cleanup-first');
    assert(homeJob);
    await assert.rejects(
      runProjectKnowledgeCleanup(jobContext({ ...homeJob, workerId: 'stale-worker' })),
      KnowledgeCleanupLeaseLost,
    );
    await assert.rejects(
      runProjectKnowledgeCleanup(jobContext({ ...homeJob, originRegion: otherRegion })),
      KnowledgeCleanupLeaseLost,
    );
    assert(fs.existsSync(home.bytes));
    await runProjectKnowledgeCleanup(jobContext(homeJob));
    assert.equal(fs.existsSync(home.bytes), false);
    assert.equal(fs.existsSync(home.metadata), false);
    await db.query(
      "update background_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [homeJob.id],
    );
    assert.equal((await reapExpiredJobLeases(queue)).requeued, 1);
    await db.query("update background_jobs set run_after=now()-interval '1 second' where id=$1", [
      homeJob.id,
    ]);
    const recovered = await claim(DEFAULT_DATA_REGION, 'fixture-cleanup-recovered');
    assert.equal(recovered.id, homeJob.id);
    assert.equal(recovered.attempts, 2);
    await assert.rejects(
      runProjectKnowledgeCleanup(jobContext(homeJob)),
      KnowledgeCleanupLeaseLost,
    );
    process.env.NODE_ENV = 'test';
    assert.equal((await runProjectKnowledgeCleanup(jobContext(recovered))).deleted, true);
    process.env.NODE_ENV = 'development';
    assert.equal(await completeJob(queue, recovered, { deleted: true }), true);

    const owner = `fixture-owner-${randomUUID()}`;
    await db.query('insert into profiles(id) values($1)', [owner]);
    const regionalOrg = randomUUID();
    const regional = await jobSource('outbox-region', owner, regionalOrg, otherRegion);
    await db.query('update organizations set data_region=$2 where id=$1', [
      regionalOrg,
      DEFAULT_DATA_REGION,
    ]);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 0);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: otherRegion }), 1);
    const cleanupJobId = (await object(db, regional.key)).cleanup_job_id;
    const control = await enqueueJob(queue, {
      kind: 'file-processing.purge-upload-object',
      userId: owner,
      organizationId: regionalOrg,
      idempotencyKey: `fixture-control:${regional.fingerprint}`,
      payload: {},
    });
    await db.query('delete from user_projects where id=$1', [regional.projectId]);
    await db.query('delete from profiles where id=$1', [owner]);
    await db.query('delete from organizations where id=$1', [regionalOrg]);
    assert.equal(
      (await db.query('select id from background_jobs where id=$1', [control.id])).rowCount,
      0,
    );
    assert.equal(
      (await db.query('select id from background_jobs where id=$1', [cleanupJobId])).rowCount,
      1,
    );
    assert.equal(await claim(DEFAULT_DATA_REGION, 'fixture-wrong-region'), undefined);
    const regionalJob = await claim(otherRegion, 'fixture-original-region');
    assert.equal(regionalJob.id, cleanupJobId);
    await runProjectKnowledgeCleanup(jobContext(regionalJob));
    assert.equal(await completeJob(queue, regionalJob), true);
    assert.equal((await object(db, regional.key)).user_id, null);

    const partialJobSource = await jobSource('outbox-partial');
    fs.unlinkSync(partialJobSource.metadata);
    fs.mkdirSync(partialJobSource.metadata);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 1);
    const partialJob = await claim(DEFAULT_DATA_REGION, 'fixture-partial');
    let storageFailure;
    try {
      await runProjectKnowledgeCleanup(jobContext(partialJob));
    } catch (error) {
      storageFailure = error;
    }
    assert(['EISDIR', 'EPERM'].includes(storageFailure?.code));
    assert.equal(fs.existsSync(partialJobSource.bytes), false);
    assert((await object(db, partialJobSource.key)).receipts['local-bytes']);
    assert.equal(await failJob(queue, partialJob, storageFailure), 'retry');
    fs.rmdirSync(partialJobSource.metadata);
    await db.query(
      "update project_knowledge_objects set lease_expires_at=clock_timestamp()-interval '1 second' where fingerprint=$1",
      [partialJobSource.fingerprint],
    );
    await db.query("update background_jobs set run_after=now()-interval '1 second' where id=$1", [
      partialJob.id,
    ]);
    const partialRetry = await claim(DEFAULT_DATA_REGION, 'fixture-partial-retry');
    assert.equal(partialRetry.id, partialJob.id);
    await runProjectKnowledgeCleanup(jobContext(partialRetry));
    assert.equal(await completeJob(queue, partialRetry), true);

    const heldOrg = randomUUID();
    const preserved = await jobSource('outbox-held', 'user-a', heldOrg, DEFAULT_DATA_REGION);
    async function placeHold(scope, resources = ['project_file'], organizationId = heldOrg) {
      return queue.transaction(async (tx) => {
        const [hold] = await tx.query(
          `insert into legal_holds(organization_id,name,scope,subject_user_id,created_by_user_id,resource_types)
         values($1,'Cleanup fixture',$2,$3,'user-a',$4::text[]) returning id`,
          [organizationId, scope, scope === 'member' ? 'user-a' : null, resources],
        );
        if (scope === 'custodian')
          await tx.query(
            "insert into legal_hold_custodians(hold_id,user_id,added_by_user_id) values($1,'user-a','user-a')",
            [hold.id],
          );
        return hold.id;
      });
    }
    async function releaseHold(id) {
      await db.query(
        "update legal_holds set released_at=now(),released_by_user_id='user-a' where id=$1",
        [id],
      );
    }
    const organizationHold = await placeHold('organization');
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 0);
    assert.equal((await object(db, preserved.key)).cleanup_job_id, null);
    await releaseHold(organizationHold);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 1);
    let heldJob = await claim(DEFAULT_DATA_REGION, 'fixture-hold-gate');
    await db.query('begin');
    try {
      await db.query('alter table legal_holds rename to unavailable_legal_holds');
      await rejectCode(() => runProjectKnowledgeCleanup(jobContext(heldJob)), '42P01');
    } finally {
      await db.query('rollback');
    }
    assert(fs.existsSync(preserved.bytes));
    for (const scope of ['member', 'custodian']) {
      const hold = await placeHold(scope);
      let heldFailure;
      try {
        await runProjectKnowledgeCleanup(jobContext(heldJob));
      } catch (error) {
        heldFailure = error;
      }
      assert.match(heldFailure.message, /active legal hold/);
      assert(fs.existsSync(preserved.bytes));
      assert.equal(await failJob(queue, heldJob, heldFailure), 'dead');
      assert.equal(
        await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }),
        0,
      );
      await releaseHold(hold);
      assert.equal(await retryDeadJob(queue, heldJob.id), true);
      heldJob = await claim(DEFAULT_DATA_REGION, `fixture-hold-released-${scope}`);
    }
    await placeHold('organization', ['conversation']);
    await runProjectKnowledgeCleanup(jobContext(heldJob));
    assert.equal(fs.existsSync(preserved.bytes), false);
    assert.equal(await completeJob(queue, heldJob), true);

    const cancelled = await jobSource('outbox-cancelled');
    await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION });
    const cancelledJob = await claim(DEFAULT_DATA_REGION, 'fixture-cancelled');
    await db.query('update background_jobs set cancel_requested_at=now() where id=$1', [
      cancelledJob.id,
    ]);
    await assert.rejects(runProjectKnowledgeCleanup(jobContext(cancelledJob)), JobCancelledError);
    assert(fs.existsSync(cancelled.bytes));
    assert.equal(await acknowledgeJobCancellation(queue, cancelledJob), true);
    await db.query(
      "update background_jobs set completed_at=now()-interval '100 days' where id=$1",
      [cancelledJob.id],
    );
    assert.equal(await pruneFinishedJobs(queue), 1);
    assert.equal((await object(db, cancelled.key)).cleanup_job_id, cancelledJob.id);
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 0);
    const shared = await jobSource('retire-shared', 'user-a', null, null, false);
    const copiedParent = await project(db);
    const [copiedFile] = (await db.query(duplicateSql, [copiedParent, 'user-a', shared.projectId]))
      .rows;
    const fileScope = {
      projectId: shared.projectId,
      userId: 'user-a',
      organizationId: null,
      fileId: shared.fileId,
    };
    assert.equal(
      await retireProjectKnowledgeFile(queue, { ...fileScope, userId: 'user-b' }),
      false,
    );
    await db.query('update user_projects set is_archived=true where id=$1', [shared.projectId]);
    assert.equal(await retireProjectKnowledgeFile(queue, fileScope), false);
    await db.query('update user_projects set is_archived=false where id=$1', [shared.projectId]);
    assert.equal(await retireProjectKnowledgeFile(queueDb(scoped), fileScope), true);
    const removedTimestamp = (
      await db.query('select updated_at from project_knowledge_files where id=$1', [shared.fileId])
    ).rows[0].updated_at;
    assert.equal(await retireProjectKnowledgeFile(queueDb(scoped), fileScope), true);
    assert.equal(
      (
        await db.query('select updated_at from project_knowledge_files where id=$1', [
          shared.fileId,
        ])
      ).rows[0].updated_at.getTime(),
      removedTimestamp.getTime(),
    );
    assert.equal((await object(db, shared.key)).reference_count, '1');
    assert(fs.existsSync(shared.bytes));
    const [chat] = (
      await db.query(
        'insert into web_conversations(user_id,project_id) values($1,$2) returning id',
        ['user-a', copiedParent],
      )
    ).rows;
    const copiedScope = { projectId: copiedParent, userId: 'user-a', organizationId: null };
    assert.equal(await retireOwnedProject(queueDb(scoped), copiedScope), true);
    assert.equal(await retireOwnedProject(queueDb(scoped), copiedScope), true);
    assert.equal(
      (await db.query('select project_id from web_conversations where id=$1', [chat.id])).rows[0]
        .project_id,
      null,
    );
    assert.notEqual(
      (
        await db.query('select deleted_at from project_knowledge_files where id=$1', [
          copiedFile.id,
        ])
      ).rows[0].deleted_at,
      null,
    );
    assert.equal((await object(db, shared.key)).state, 'queued');
    assert(fs.existsSync(shared.bytes));
    assert.equal(await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION }), 1);
    const sharedJob = await claim(DEFAULT_DATA_REGION, 'fixture-retired-project');
    await runProjectKnowledgeCleanup(jobContext(sharedJob));
    assert.equal(await completeJob(queue, sharedJob), true);
    assert.equal(fs.existsSync(shared.bytes), false);
    await rejectCode(() => file(db, copiedParent, 'knowledge/late-retired-parent.pdf'), '23503');

    const heldSource = await jobSource(
      'retire-held-source',
      'user-a',
      heldOrg,
      DEFAULT_DATA_REGION,
      false,
    );
    const heldScope = {
      projectId: heldSource.projectId,
      userId: 'user-a',
      organizationId: heldOrg,
    };
    const heldFile = await placeHold('member');
    await db.query(
      "insert into organization_members(organization_id,user_id,role) values($1,'user-a','member') on conflict(organization_id,user_id) do update set role='member'",
      [heldOrg],
    );
    await scoped.query("select set_config('request.jwt.claim.org_id',$1,false)", [heldOrg]);
    assert.equal((await scoped.query('select id from legal_holds')).rowCount, 0);
    await assert.rejects(
      retireProjectKnowledgeFile(queueDb(scoped), { ...heldScope, fileId: heldSource.fileId }),
      ProjectContentHeldError,
    );
    await rejectCode(
      () => scoped.query('select app_project_content_held($1,$2) as held', [b, 'project_file']),
      '42501',
    );
    await scoped.query("set request.jwt.claim.org_id=''");
    await assert.rejects(
      retireProjectKnowledgeFile(queue, { ...heldScope, fileId: heldSource.fileId }),
      ProjectContentHeldError,
    );
    await assert.rejects(retireOwnedProject(queue, heldScope), ProjectContentHeldError);
    assert.equal(
      (await db.query('select deleted_at from user_projects where id=$1', [heldSource.projectId]))
        .rows[0].deleted_at,
      null,
    );
    assert.equal((await object(db, heldSource.key)).reference_count, '1');
    assert(fs.existsSync(heldSource.bytes));
    await releaseHold(heldFile);
    const heldProject = await placeHold('member', ['project']);
    await assert.rejects(
      retireOwnedProject(queue, heldScope),
      (error) => error instanceof ProjectContentHeldError && error.resourceType === 'project',
    );
    await releaseHold(heldProject);
    await scoped.query("select set_config('request.jwt.claim.org_id',$1,false)", [heldOrg]);
    assert.equal(
      await retireProjectKnowledgeFile(queueDb(scoped), {
        ...heldScope,
        fileId: heldSource.fileId,
      }),
      true,
    );
    await scoped.query("set request.jwt.claim.org_id=''");

    const admissionParent = await project(db);
    await left.query('begin');
    const admissionFile = await file(left, admissionParent, 'knowledge/admission-wins.pdf');
    const retirement = retireOwnedProject(queueDb(right), {
      projectId: admissionParent,
      userId: 'user-a',
      organizationId: null,
    });
    retirement.catch(() => {});
    try {
      await lockWait(observer, rightPid, leftPid);
    } finally {
      await left.query('commit');
    }
    assert.equal(await retirement, true);
    assert.notEqual(
      (
        await db.query('select deleted_at from project_knowledge_files where id=$1', [
          admissionFile,
        ])
      ).rows[0].deleted_at,
      null,
    );
    const retirementParent = await project(db);
    let allowRetirement;
    let retirementLocked;
    const gate = new Promise((resolve) => {
      allowRetirement = resolve;
    });
    const rowLocked = new Promise((resolve) => {
      retirementLocked = resolve;
    });
    const retiringQueue = queueDb(left, async (sql) => {
      if (sql.includes('update user_projects p set deleted_at')) {
        retirementLocked();
        await gate;
      }
    });
    const retiring = retireOwnedProject(retiringQueue, {
      projectId: retirementParent,
      userId: 'user-a',
      organizationId: null,
    });
    retiring.catch(() => {});
    let lateAdmission;
    try {
      await Promise.race([
        rowLocked,
        delay(5000).then(() => assert.fail('No project retirement lock was observed')),
      ]);
      lateAdmission = file(right, retirementParent, 'knowledge/retirement-wins.pdf').then(
        () => null,
        (error) => error,
      );
      await lockWait(observer, rightPid, leftPid);
    } finally {
      allowRetirement();
    }
    assert.equal(await retiring, true);
    assert.equal((await lateAdmission).code, '23503');
    assert.equal(await object(db, 'knowledge/retirement-wins.pdf'), undefined);
    const repeatRetirement = await project(db);
    await db.query('begin isolation level repeatable read');
    try {
      await rejectCode(
        () => db.query('update user_projects set deleted_at=now() where id=$1', [repeatRetirement]),
        '40001',
      );
    } finally {
      await db.query('rollback');
    }
    assert.equal(
      (await db.query('select deleted_at from user_projects where id=$1', [repeatRetirement]))
        .rows[0].deleted_at,
      null,
    );

    const retention = createDomainSweepers().projects;
    const retentionContext = (organizationId) => ({
      organizationId,
      cutoff: '2001-01-01T00:00:00Z',
      resourceType: 'project',
      limit: 10,
    });
    const expire = (id) =>
      db.query("update user_projects set updated_at='2000-01-01T00:00:00Z' where id=$1", [id]);
    const retentionOrg = randomUUID();
    const retainedCopy = await jobSource('retention-shared', 'user-a', retentionOrg, null, false);
    const retainedParent = await project(db, 'user-a', retentionOrg);
    await db.query(duplicateSql, [retainedParent, 'user-a', retainedCopy.projectId]);
    const [retainedChat] = (
      await db.query(
        'insert into web_conversations(user_id,project_id,organization_id) values($1,$2,$3) returning id',
        ['user-a', retainedCopy.projectId, retentionOrg],
      )
    ).rows;
    await expire(retainedCopy.projectId);
    assert.deepEqual(await retention.sweepBatch(queue, retentionContext(retentionOrg)), {
      recordsDeleted: 1,
      objectsDeleted: 0,
      objectsFailed: 0,
      candidates: 1,
    });
    assert.equal(
      (await db.query('select id from user_projects where id=$1', [retainedCopy.projectId]))
        .rowCount,
      0,
    );
    assert.equal(
      (await db.query('select project_id from web_conversations where id=$1', [retainedChat.id]))
        .rows[0].project_id,
      null,
    );
    assert.equal((await object(db, retainedCopy.key)).reference_count, '1');
    assert(fs.existsSync(retainedCopy.bytes));
    assert.equal(
      (await retention.sweepBatch(queue, retentionContext(randomUUID()))).recordsDeleted,
      0,
    );
    await expire(retainedParent);
    assert.equal(
      (await retention.sweepBatch(queue, retentionContext(retentionOrg))).recordsDeleted,
      1,
    );
    assert.equal((await object(db, retainedCopy.key)).state, 'queued');
    assert.equal((await object(db, retainedCopy.key)).user_id, 'user-a');
    assert(fs.existsSync(retainedCopy.bytes));
    await dispatchProjectKnowledgeCleanup(queue, { region: DEFAULT_DATA_REGION });
    const retentionJobs = await claimJobs(queue, {
      queues: ['data-deletion'],
      region: DEFAULT_DATA_REGION,
      workerId: 'fixture-retention-after-parent-purge',
      limit: 100,
    });
    const retentionJob = retentionJobs.find(
      (job) => job.payload.fingerprint === retainedCopy.fingerprint,
    );
    assert(retentionJob, 'The purged parent must leave a claimable cleanup job');
    await runProjectKnowledgeCleanup(jobContext(retentionJob));
    assert.equal(await completeJob(queue, retentionJob), true);
    assert.equal(fs.existsSync(retainedCopy.bytes), false);

    const rollbackOrg = randomUUID();
    const rollbackSource = await jobSource(
      'retention-rollback',
      'user-a',
      rollbackOrg,
      null,
      false,
    );
    const rollbackCompanion = await jobSource(
      'retention-rollback-companion',
      'user-a',
      rollbackOrg,
      null,
      false,
    );
    await expire(rollbackSource.projectId);
    await expire(rollbackCompanion.projectId);
    let rolledBackDeletions = 0;
    await assert.rejects(
      retention.sweepBatch(
        queueDb(db, async (sql) => {
          if (sql.includes('delete from public.user_projects p')) {
            rolledBackDeletions++;
            if (rolledBackDeletions === 2) throw new Error('synthetic project retention rollback');
          }
        }),
        retentionContext(rollbackOrg),
      ),
      /synthetic project retention rollback/,
    );
    assert.equal(rolledBackDeletions, 2);
    for (const source of [rollbackSource, rollbackCompanion]) {
      assert.equal((await object(db, source.key)).state, 'referenced');
      assert.equal((await object(db, source.key)).reference_count, '1');
      assert.equal(
        (await db.query('select deleted_at from user_projects where id=$1', [source.projectId]))
          .rows[0].deleted_at,
        null,
      );
      assert(fs.existsSync(source.bytes));
    }

    let lostRetentionAcknowledgement = false;
    const uncertainRetention = {
      async query(sql, params) {
        const result = await db.query(sql, params);
        if (sql === 'commit' && !lostRetentionAcknowledgement) {
          lostRetentionAcknowledgement = true;
          throw new Error('synthetic lost project retention acknowledgement');
        }
        return result;
      },
    };
    await assert.rejects(
      retention.sweepBatch(queueDb(uncertainRetention), retentionContext(rollbackOrg)),
      /synthetic lost project retention acknowledgement/,
    );
    assert(lostRetentionAcknowledgement);
    for (const source of [rollbackSource, rollbackCompanion]) {
      assert.equal((await object(db, source.key)).state, 'queued');
      assert(fs.existsSync(source.bytes));
    }
    assert.equal(
      (await retention.sweepBatch(queue, retentionContext(rollbackOrg))).recordsDeleted,
      0,
    );

    const retentionHoldOrg = randomUUID();
    const heldTombstone = await jobSource('retention-held-tombstone', 'user-a', retentionHoldOrg);
    const unheldEmptyParent = await project(db, 'user-a', retentionHoldOrg);
    await expire(heldTombstone.projectId);
    await expire(unheldEmptyParent);
    const retentionFileHold = await placeHold('organization', ['project_file'], retentionHoldOrg);
    assert.equal(await retention.countHeld(queue, retentionContext(retentionHoldOrg)), 1);
    assert.equal(
      (await retention.sweepBatch(queue, retentionContext(retentionHoldOrg))).recordsDeleted,
      1,
    );
    assert.equal(
      (await db.query('select id from project_knowledge_files where id=$1', [heldTombstone.fileId]))
        .rowCount,
      1,
    );
    assert(fs.existsSync(heldTombstone.bytes));
    await releaseHold(retentionFileHold);
    const retentionProjectHold = await placeHold('member', ['project'], retentionHoldOrg);
    assert.equal(await retention.countHeld(queue, retentionContext(retentionHoldOrg)), 1);
    assert.equal(
      (await retention.sweepBatch(queue, retentionContext(retentionHoldOrg))).recordsDeleted,
      0,
    );
    await releaseHold(retentionProjectHold);
    const retentionLateHold = [];
    await assert.rejects(
      retention.sweepBatch(
        queueDb(db, async (sql) => {
          if (sql.includes('for update of p skip locked')) {
            const [hold] = (
              await right.query(
                `insert into legal_holds(organization_id,name,scope,subject_user_id,created_by_user_id,resource_types)
                  values($1,'Late retention fixture','member','user-a','user-a',array['project_file']) returning id`,
                [retentionHoldOrg],
              )
            ).rows;
            retentionLateHold.push(hold.id);
          }
        }),
        retentionContext(retentionHoldOrg),
      ),
      /unavailable for retention cleanup/,
    );
    assert.equal(retentionLateHold.length, 1);
    await releaseHold(retentionLateHold[0]);
    assert.equal(
      (await db.query('select id from project_knowledge_files where id=$1', [heldTombstone.fileId]))
        .rowCount,
      1,
    );

    const overlapOrg = randomUUID();
    const overlapSource = await jobSource('retention-overlap', 'user-a', overlapOrg, null, false);
    await expire(overlapSource.projectId);
    let releaseRetention;
    let retentionSelectionObserved;
    const retentionGate = new Promise((resolve) => {
      releaseRetention = resolve;
    });
    const retentionSelected = new Promise((resolve) => {
      retentionSelectionObserved = resolve;
    });
    const firstRetention = retention.sweepBatch(
      queueDb(left, async (sql) => {
        if (sql.includes('for update of p skip locked')) {
          retentionSelectionObserved();
          await retentionGate;
        }
      }),
      retentionContext(overlapOrg),
    );
    firstRetention.catch(() => {});
    let retentionAdmission;
    try {
      await Promise.race([
        retentionSelected,
        delay(5000).then(() => assert.fail('No retention selection was observed')),
      ]);
      assert.equal((await retention.sweepBatch(queue, retentionContext(overlapOrg))).candidates, 0);
      retentionAdmission = file(
        right,
        overlapSource.projectId,
        'knowledge/retention-late.pdf',
      ).then(
        () => null,
        (error) => error,
      );
      await lockWait(observer, rightPid, leftPid);
    } finally {
      releaseRetention();
    }
    assert.equal((await firstRetention).recordsDeleted, 1);
    assert.equal((await retentionAdmission).code, '23503');
    assert.equal(await object(db, 'knowledge/retention-late.pdf'), undefined);
    assert.equal((await object(db, overlapSource.key)).state, 'queued');
    assert(fs.existsSync(overlapSource.bytes));
  } finally {
    process.chdir(previousDirectory);
    clearStorageEnvironment();
    Object.assign(process.env, storageEnvironment);
  }
  const legacy = createLocalPostgresTestClient({
    host: socket,
    port: 5432,
    database: 'legacy_fixture',
    user: process.env.USER,
  });
  await admin.query('create database legacy_fixture owner lifecycle_owner');
  await legacy.connect();
  clients.push(legacy);
  await legacy.query('set role lifecycle_owner');
  await organizations(legacy);
  await legacy.query(
    fs.readFileSync(path.join(root, 'apps/web/db/neon/0006_projects.sql'), 'utf8'),
  );
  await legacy.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/0035_project_knowledge_file_lifecycle.sql'),
      'utf8',
    ),
  );
  await legacy.query(
    'alter table user_projects add column organization_id uuid, add column deleted_at timestamptz',
  );
  const legacyProject = await project(legacy);
  const legacyFile = await file(
    legacy,
    legacyProject,
    'https://fixture.invalid/knowledge/legacy.pdf',
  );
  await rejectCode(() => legacy.query(migration), 'P0001');
  await legacy.query('rollback');
  assert.equal(
    (await legacy.query("select to_regclass('public.project_knowledge_objects') as relation"))
      .rows[0].relation,
    null,
  );
  const normalizationEnvironment = {
    publicBase: process.env.AGI_STORAGE_PUBLIC_BASE_URL,
    legacyBase: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL,
  };
  try {
    process.env.AGI_STORAGE_PUBLIC_BASE_URL = 'https://fixture.invalid';
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = '';
    let reportsReadOnly = 0;
    const normalizer = normalizationDb(legacy, async (sql) => {
      if (sql.includes('case when octet_length')) {
        assert.equal(
          (await legacy.query("select current_setting('transaction_read_only') as value")).rows[0]
            .value,
          'on',
        );
        reportsReadOnly++;
      }
    });
    const report = await normalizeProjectKnowledgeKeys(normalizer, {});
    assert.equal(reportsReadOnly, 1);
    assert.equal(report.conversions, 1);
    assert.equal(report.ready, true);
    assert.equal(report.applied, false);
    assert(!JSON.stringify(report).includes('fixture.invalid'));
    assert.equal(
      (await legacy.query('select storage_uri from project_knowledge_files')).rows[0].storage_uri,
      'https://fixture.invalid/knowledge/legacy.pdf',
    );
    const extra = await file(legacy, legacyProject, 'knowledge/extra.pdf');
    await assert.rejects(
      normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: report.review }),
      /inventory or configured storage mapping changed/,
    );
    await legacy.query('delete from project_knowledge_files where id=$1', [extra]);
    process.env.AGI_STORAGE_PUBLIC_BASE_URL = 'https://changed.invalid';
    const unknown = await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {});
    assert.equal(unknown.unresolved, 1);
    await assert.rejects(
      normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: report.review }),
      /inventory or configured storage mapping changed/,
    );
    await assert.rejects(
      normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: unknown.review }),
      /Unresolved references/,
    );
    process.env.AGI_STORAGE_PUBLIC_BASE_URL = 'https://fixture.invalid';
    const collisionProject = await project(legacy, 'user-b');
    for (const scope of [
      ['user-b', null],
      ['user-a', randomUUID()],
    ]) {
      await legacy.query('update user_projects set user_id=$2,organization_id=$3 where id=$1', [
        collisionProject,
        ...scope,
      ]);
      const collisionFile = await file(legacy, collisionProject, 'knowledge/legacy.pdf');
      const conflict = await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {});
      assert.equal(conflict.conflictingKeys, 1);
      assert.equal(conflict.ready, false);
      await assert.rejects(
        normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: conflict.review }),
        /conflicting owning scopes/,
      );
      await legacy.query('delete from project_knowledge_files where id=$1', [collisionFile]);
    }
    const historical = await file(
      legacy,
      collisionProject,
      'https://fixture.invalid/knowledge/legacy.pdf',
    );
    await legacy.query(
      "update project_knowledge_files set deleted_at='2026-01-01T00:00:00Z'::timestamptz,checksum_sha256=$2 where id=$1",
      [historical, 'c'.repeat(64)],
    );
    const withHistory = await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {});
    assert.equal(withHistory.conversions, 2);
    assert.equal(withHistory.conflictingKeys, 0);
    await normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: withHistory.review });
    const historicalRow = (
      await legacy.query(
        'select storage_uri,deleted_at,checksum_sha256 from project_knowledge_files where id=$1',
        [historical],
      )
    ).rows[0];
    assert.equal(historicalRow.storage_uri, 'knowledge/legacy.pdf');
    assert.equal(historicalRow.deleted_at.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(historicalRow.checksum_sha256, 'c'.repeat(64));
    await legacy.query('delete from project_knowledge_files where id=$1', [historical]);
    await legacy.query('update project_knowledge_files set storage_uri=$2 where id=$1', [
      legacyFile,
      'https://fixture.invalid/knowledge/legacy.pdf',
    ]);
    await legacy.query(
      `insert into project_knowledge_files(project_id,file_name,storage_uri)
       select $1,'bounded fixture','knowledge/bounded-'||n from generate_series(1,$2) n`,
      [collisionProject, KNOWLEDGE_KEY_NORMALIZATION_LIMIT],
    );
    await assert.rejects(
      normalizeProjectKnowledgeKeys(normalizationDb(legacy), {}),
      /bounded normalization window/,
    );
    await legacy.query('delete from project_knowledge_files where project_id=$1', [
      collisionProject,
    ]);
    const oversized = await file(legacy, collisionProject, 'a'.repeat(8193));
    assert.equal((await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {})).unresolved, 1);
    await legacy.query('delete from project_knowledge_files where id=$1', [oversized]);
    const noReceipt = normalizationDb(legacy, async (sql, result) => {
      if (sql.includes('returning f.id')) result.rows = [];
    });
    await assert.rejects(
      normalizeProjectKnowledgeKeys(noReceipt, { review: report.review }),
      /did not cover its reviewed inventory/,
    );
    assert.equal(
      (await legacy.query('select storage_uri from project_knowledge_files')).rows[0].storage_uri,
      'https://fixture.invalid/knowledge/legacy.pdf',
    );
    const copy = createLocalPostgresTestClient({
      host: socket,
      database: 'legacy_fixture',
      user: process.env.USER,
    });
    await copy.connect();
    clients.push(copy);
    await copy.query('set role lifecycle_owner');
    const copyPid = (await copy.query('select pg_backend_pid() as id')).rows[0].id;
    const normalizationPid = (await legacy.query('select pg_backend_pid() as id')).rows[0].id;
    let waitingWrite;
    const locked = normalizationDb(legacy, async (sql) => {
      if (sql.startsWith('lock table')) {
        waitingWrite = copy.query('update project_knowledge_files set file_name=$1', [
          'After normalization',
        ]);
        waitingWrite.catch(() => {});
        await lockWait(admin, copyPid, normalizationPid);
      }
    });
    const applied = await normalizeProjectKnowledgeKeys(locked, { review: report.review });
    await waitingWrite;
    assert.equal(applied.applied, true);
    assert.equal(
      (await legacy.query('select storage_uri,file_name from project_knowledge_files')).rows[0]
        .storage_uri,
      'knowledge/legacy.pdf',
    );
    assert.equal(
      (await legacy.query('select file_name from project_knowledge_files')).rows[0].file_name,
      'After normalization',
    );
    const canonical = await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {});
    assert.equal(canonical.conversions, 0);
    await normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: canonical.review });
    await legacy.query('update project_knowledge_files set storage_uri=$2 where id=$1', [
      legacyFile,
      'https://fixture.invalid/knowledge/legacy.pdf',
    ]);
    let acknowledgementLost = false;
    const loseCommit = normalizationDb({
      async query(sql, params) {
        const result = await legacy.query(sql, params);
        if (sql === 'commit' && !acknowledgementLost) {
          acknowledgementLost = true;
          throw new Error('synthetic normalization commit acknowledgement loss');
        }
        return result;
      },
    });
    await assert.rejects(
      normalizeProjectKnowledgeKeys(loseCommit, { review: report.review }),
      /commit acknowledgement loss/,
    );
    assert.equal((await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {})).conversions, 0);
    await assert.rejects(
      normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: report.review }),
      /inventory or configured storage mapping changed/,
    );
    const cliConnection = new URL('postgresql://127.0.0.1/legacy_fixture');
    cliConnection.username = process.env.USER;
    cliConnection.password = 'fixture';
    cliConnection.searchParams.set('host', socket);
    const transportProbe = createLocalPostgresTestClient({ connectionString: cliConnection.href });
    assert.equal(transportProbe.host, fs.realpathSync(socket));
    assert.equal(transportProbe.database, 'legacy_fixture');
    const runNormalizer = (args, overrides = {}) => {
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--conditions=react-server',
          path.join(root, 'apps/web/scripts/normalize-project-knowledge-keys.mjs'),
          ...args,
        ],
        {
          cwd: path.join(root, 'apps/web'),
          env: {
            PATH: process.env.PATH,
            USER: process.env.USER,
            NODE_ENV: 'test',
            AGI_DATABASE_PROVIDER: 'postgres',
            AGI_DATABASE_URL: cliConnection.href,
            AGI_STORAGE_PUBLIC_BASE_URL: 'https://fixture.invalid',
            ...overrides,
          },
          encoding: 'utf8',
          timeout: 30_000,
        },
      );
      assert(!output.includes('fixture.invalid'));
      assert(!output.includes(cliConnection.href));
      return JSON.parse(output);
    };
    await legacy.query('update project_knowledge_files set storage_uri=$2 where id=$1', [
      legacyFile,
      'https://fixture.invalid/knowledge/legacy.pdf',
    ]);
    const cliReview = runNormalizer(['report']);
    assert.equal(cliReview.conversions, 1);
    assert.equal(cliReview.applied, false);
    const cliApply = runNormalizer(['apply', '--review', cliReview.review, '--target', 'local']);
    assert.equal(cliApply.applied, true);
    assert.equal(runNormalizer(['report']).conversions, 0);
    assert.throws(
      () => runNormalizer(['report'], { AGI_DATABASE_PROVIDER: 'private-fixture-material' }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /Database initialization refused/);
        assert(!error.stderr.includes('private-fixture-material'));
        return true;
      },
    );
    assert.equal(
      (
        await legacy.query('select storage_uri from project_knowledge_files where id=$1', [
          legacyFile,
        ])
      ).rows[0].storage_uri,
      'knowledge/legacy.pdf',
    );
    await rejectCode(() => normalizeProjectKnowledgeKeys(normalizationDb(scoped), {}), '42501');
  } finally {
    for (const [name, value] of [
      ['AGI_STORAGE_PUBLIC_BASE_URL', normalizationEnvironment.publicBase],
      ['CLOUDFLARE_R2_PUBLIC_BASE_URL', normalizationEnvironment.legacyBase],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  await legacy.query('update project_knowledge_files set storage_uri=$1', ['knowledge/mixed.pdf']);
  const otherLegacyProject = await project(legacy, 'user-b');
  await file(legacy, otherLegacyProject, 'knowledge/mixed.pdf');
  await rejectCode(() => legacy.query(migration), 'P0001');
  await legacy.query('rollback');
  await legacy.query('delete from project_knowledge_files where project_id=$1', [
    otherLegacyProject,
  ]);
  await legacy.query(helper('0037_rls_user_isolation.sql', 'current_app_user_id'));
  await legacy.query(helper('0073_tenancy_foundation.sql', 'current_app_org_id'));
  await legacy.query('create table schema_migrations(filename text primary key)');
  await legacy.query(migration);
  const installedReport = await normalizeProjectKnowledgeKeys(normalizationDb(legacy), {});
  await assert.rejects(
    normalizeProjectKnowledgeKeys(normalizationDb(legacy), { review: installedReport.review }),
    /before installing the object lifecycle fence/,
  );
  await legacy.query('insert into schema_migrations(filename) values($1)', [
    '0419_project_knowledge_object_lifecycle.sql',
  ]);
  await legacy.query(
    fs.readFileSync(
      path.join(root, 'apps/web/db/neon/down/0419_project_knowledge_object_lifecycle.down.sql'),
      'utf8',
    ),
  );
  assert.equal(
    (await legacy.query("select to_regclass('public.project_knowledge_objects') as relation"))
      .rows[0].relation,
    null,
  );
  assert.equal(
    (await legacy.query('select count(*) as count from project_knowledge_files')).rows[0].count,
    '1',
  );
  assert.equal(
    (await legacy.query('select count(*) as count from schema_migrations')).rows[0].count,
    '0',
  );
  process.stdout.write(
    'Real PostgreSQL lifecycle checks passed: non-bypass RLS, both duplicate/delete orderings, repeatable-read serialization, scope fences, partial receipts, pinned targets, stale leases, non-resurrection, real driver partial-target recovery, real local-file partial failure and namespace refusal, lost storage acknowledgements, project retention with shared files, multi-project rollback, hold preservation, overlapping sweeps and post-parent cleanup, legacy-URL preflight and review-bound normalization with scope/RLS/limit refusal, rollback, blocked writers and lost commit acknowledgement.\n',
  );
} finally {
  for (const connected of clients) await connected.end().catch(() => {});
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(directory, { recursive: true, force: true });
}
