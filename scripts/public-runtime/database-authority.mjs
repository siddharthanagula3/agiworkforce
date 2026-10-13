import { DATABASE_PREFIX } from './proof.mjs';

export const APP_OS_USER = 'agi-proof-app';
export const APP_UID = 1000;
const ROUTINE_CANARY = 'public.agi_public_proof_admin_canary';

export function caseDatabaseRole(database) {
  const match = new RegExp(`^${DATABASE_PREFIX}([a-f0-9]{24}_[0-9]+)$`).exec(database);
  if (!match) throw new Error('Invalid case database identity');
  return `agi_public_case_${match[1]}`;
}

export function peerConfiguration(database = null) {
  const role = database ? caseDatabaseRole(database) : null;
  return {
    hba: [
      'local all postgres peer map=agi_proof_admin',
      ...(database ? [`local ${database} ${role} peer map=agi_proof_case`] : []),
      'local all all reject',
      'host all all 0.0.0.0/0 reject',
      'host all all ::0/0 reject',
    ].join('\n'),
    ident: [
      'agi_proof_admin root postgres',
      'agi_proof_admin postgres postgres',
      ...(database ? [`agi_proof_case ${APP_OS_USER} ${role}`] : []),
    ].join('\n'),
  };
}

export function authorityQueries(runId) {
  if (!/^[a-f0-9]{24}$/.test(runId)) throw new Error('Invalid privilege canary identity');
  return [
    { name: 'change-cluster-logging', sql: "alter system set log_statement='none'" },
    { name: 'change-session-logging', sql: "set log_statement='none'" },
    { name: 'create-role', sql: `create role proof_denied_${runId}` },
    { name: 'create-database', sql: `create database proof_denied_${runId}` },
    { name: 'become-admin-role', sql: 'set role postgres' },
    { name: 'become-admin-session', sql: 'set session authorization postgres' },
    {
      name: 'write-public-content',
      sql: 'update public.shared_sessions set title=title where false',
    },
    { name: 'invoke-definer-routine', sql: `select ${ROUTINE_CANARY}()` },
    { name: 'create-public-table', sql: `create table public.proof_denied_${runId} (id integer)` },
  ];
}

export async function confineCaseReads(client, database, role) {
  if (caseDatabaseRole(database) !== role)
    throw new Error('Read authority requires the exact case role');
  await client.query(`revoke create,temporary on database "${database}" from public,"${role}"`);
  await client.query(`revoke create on schema public from public,"${role}"`);
  await client.query(`revoke all on all tables in schema public from public,"${role}"`);
  await client.query(`revoke all on all sequences in schema public from public,"${role}"`);
  await client.query(`grant select on all tables in schema public to "${role}"`);
  await client.query(
    `create function ${ROUTINE_CANARY}() returns integer language sql security definer set search_path=pg_catalog as 'select 1'`,
  );
  const routines =
    await client.query(`select quote_ident(n.nspname)||'.'||quote_ident(p.proname)||'('||pg_get_function_identity_arguments(p.oid)||')' as identity
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prosecdef and n.nspname <> 'information_schema' and n.nspname !~ '^pg_' order by p.oid`);
  if (!routines.rows.some((row) => row.identity === `${ROUTINE_CANARY}()`))
    throw new Error('The definer denial canary was not catalogued');
  for (const routine of routines.rows)
    await client.query(`revoke execute on routine ${routine.identity} from public,"${role}"`);
  const result = await client.query(
    `select
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef
      and n.nspname <> 'information_schema' and n.nspname !~ '^pg_' and has_function_privilege($1,p.oid,'execute')) as definer_execute,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f')
      and n.nspname <> 'information_schema' and n.nspname !~ '^pg_'
      and (has_table_privilege($1,c.oid,'insert,update,delete,truncate,references,trigger') or has_any_column_privilege($1,c.oid,'insert,update,references'))) as table_write,
    exists(select 1 from pg_namespace n where n.nspname <> 'information_schema' and n.nspname !~ '^pg_' and has_schema_privilege($1,n.oid,'create')) as schema_create,
    has_database_privilege($1,current_database(),'create,temporary') as database_create`,
    [role],
  );
  const authority = result.rows[0];
  if (
    !authority ||
    ['definer_execute', 'table_write', 'schema_create', 'database_create'].some(
      (key) => authority[key] !== false,
    )
  )
    throw new Error('Application read authority is not confined in the actual catalog');
  return { definerRoutines: routines.rows.map((row) => row.identity), ...authority };
}

export async function probeApplicationAuthority(Client, connectionString, state) {
  const client = new Client({
    connectionString,
    application_name: 'agi-public-proof-canary',
    connectionTimeoutMillis: 2000,
  });
  await client.connect();
  const probes = [];
  try {
    const identity = await client.query(
      'select current_user as name, inet_server_addr() as address',
    );
    if (identity.rows[0]?.name !== state.databaseRole || identity.rows[0]?.address !== null)
      throw new Error('The application did not authenticate as its confined peer identity');
    for (const { name, sql } of authorityQueries(state.runId)) {
      try {
        await client.query(sql);
        throw new Error(`Application privilege escaped: ${name}`);
      } catch (error) {
        if (error.code !== '42501') throw error;
        probes.push({ name, sql, code: error.code });
      }
    }
    for (const [name, database, user] of [
      ['impersonate-postgres', state.database, 'postgres'],
      ['connect-template', state.templateDatabase, state.databaseRole],
      ['connect-other-database', 'postgres', state.databaseRole],
    ]) {
      const url = new URL(connectionString);
      url.pathname = `/${database}`;
      url.username = user;
      const attempt = new Client({
        connectionString: url.href,
        application_name: `proof_${name}_${state.runId}`,
        connectionTimeoutMillis: 2000,
      });
      try {
        await attempt.connect();
        throw new Error(`Application connection escaped: ${name}`);
      } catch (error) {
        if (error.code !== '28000') throw error;
        probes.push({ name, database, user, code: error.code });
      } finally {
        await attempt.end();
      }
    }
    await client.query("set application_name='agi-public-proof-controller'");
    await client.query(`select 'proof_spoof_${state.runId}'`);
    probes.push({
      name: 'application-name-is-not-authority',
      marker: `proof_spoof_${state.runId}`,
    });
    return probes;
  } finally {
    await client.end();
  }
}
