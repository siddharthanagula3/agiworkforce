import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_OS_USER,
  authorityQueries,
  caseDatabaseRole,
  peerConfiguration,
  probeApplicationAuthority,
  confineCaseReads,
} from './database-authority.mjs';
import { DATABASE_PREFIX, DATABASE_SOCKET } from './proof.mjs';

const runId = '1'.repeat(24);
const database = `${DATABASE_PREFIX}${runId}_0`;
const state = {
  runId,
  database,
  templateDatabase: `${DATABASE_PREFIX}${runId}`,
  databaseRole: caseDatabaseRole(database),
};
const connectionString = `postgres://${state.databaseRole}@localhost/${database}?host=${DATABASE_SOCKET}&sslmode=disable`;

test('the PostgreSQL policy maps the exact app OS identity to only one case role and database', () => {
  const { hba, ident } = peerConfiguration(database);
  assert.match(hba, new RegExp(`local ${database} ${state.databaseRole} peer map=agi_proof_case`));
  assert.match(ident, new RegExp(`agi_proof_case ${APP_OS_USER} ${state.databaseRole}`));
  assert.ok(hba.includes('local all all reject'));
  assert.doesNotMatch(hba, /trust|password|scram/);
  assert.equal(ident.split('\n').filter((line) => line.includes(APP_OS_USER)).length, 1);
  assert.ok(!peerConfiguration().ident.includes(APP_OS_USER));
  assert.throws(() => peerConfiguration('ordinary_database'), /Invalid case/);
});

function clientClass(escape = null) {
  return class {
    constructor(options) {
      this.url = new URL(options.connectionString);
    }
    async connect() {
      if (this.url.username !== state.databaseRole || this.url.pathname !== `/${database}`) {
        if (escape === 'connection') return;
        throw Object.assign(new Error('peer denied'), { code: '28000' });
      }
    }
    async query(sql) {
      if (sql.startsWith('select current_user'))
        return { rows: [{ name: state.databaseRole, address: null }] };
      const probe = authorityQueries(runId).find((candidate) => candidate.sql === sql);
      if (probe) {
        if (escape === probe.name) return { rows: [] };
        throw Object.assign(new Error('denied'), { code: '42501' });
      }
      return { rows: [] };
    }
    async end() {}
  };
}

test('every administrative capability denial is required by the live canary runner', async () => {
  assert.equal(
    (await probeApplicationAuthority(clientClass(), connectionString, state)).length,
    authorityQueries(runId).length + 4,
  );
  for (const probe of authorityQueries(runId)) {
    await assert.rejects(
      probeApplicationAuthority(clientClass(probe.name), connectionString, state),
      /privilege escaped/,
    );
  }
  await assert.rejects(
    probeApplicationAuthority(clientClass('connection'), connectionString, state),
    /connection escaped/,
  );
});

test('read authority revokes definer execution and fails on catalogued write privileges', async () => {
  const run = async (escape = {}) => {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.startsWith('select quote_ident'))
          return {
            rows: [
              { identity: 'public.agi_public_proof_admin_canary()' },
              { identity: 'public.existing_definer(text)' },
            ],
          };
        if (sql.includes('as definer_execute'))
          return {
            rows: [
              {
                definer_execute: false,
                table_write: false,
                schema_create: false,
                database_create: false,
                ...escape,
              },
            ],
          };
        return { rows: [] };
      },
    };
    const result = await confineCaseReads(client, database, state.databaseRole);
    return { result, queries };
  };
  const { result, queries } = await run();
  assert.equal(result.definerRoutines.length, 2);
  assert.equal(queries.filter((sql) => sql.startsWith('revoke execute on routine')).length, 2);
  assert.ok(
    queries
      .filter((sql) => sql.startsWith('revoke execute on routine'))
      .every((sql) => sql.endsWith(`from public,"${state.databaseRole}"`)),
  );
  assert.ok(queries.some((sql) => sql.startsWith('grant select on all tables')));
  assert.ok(queries.every((sql) => !/^grant (?:insert|update|delete|all)/i.test(sql)));
  for (const key of ['definer_execute', 'table_write', 'schema_create', 'database_create'])
    await assert.rejects(run({ [key]: true }), /actual catalog/);
});
