// TEMP: apply the cloud-sync migration chain to PRODUCTION. Deleted after use.
// Idempotent + additive. Verified beforehand on a copy-of-prod branch.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
const sql = neon(readFileSync('/tmp/prod_conn.txt', 'utf8').trim());

function statements(file) {
  const noComments = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, '')) // strip inline + full-line comments (some contain ;)
    .join('\n');
  const out = [];
  let cur = '';
  let inDollar = false;
  for (let i = 0; i < noComments.length; i++) {
    if (noComments.slice(i, i + 2) === '$$') {
      inDollar = !inDollar;
      cur += '$$';
      i++;
      continue;
    }
    const ch = noComments[i];
    if (ch === ';' && !inDollar) {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const chain = [
  '0037_rls_user_isolation',
  '0038_cloud_sync_versioning',
  '0039_artifact_cloud_sync',
  '0040_memory_cloud_sync',
  '0041_projects_cloud_sync',
  '0042_settings_cloud_sync',
];
console.log('Applying to PRODUCTION (idempotent)...\n');
for (const m of chain) {
  const stmts = statements(`db/neon/${m}.sql`);
  let n = 0;
  let err = null;
  for (const s of stmts) {
    try {
      await sql.query(s);
      n++;
    } catch (e) {
      err = e.message;
      break;
    }
  }
  console.log(`${err ? 'FAIL' : 'OK  '} ${m}  (${n}/${stmts.length})${err ? '  ' + err : ''}`);
  if (err) {
    console.log('\nSTOPPED on failure.');
    process.exit(1);
  }
}

console.log('\n=== VERIFY production schema ===');
const seq = await sql.query(
  `select 1 from pg_sequences where sequencename = 'cloud_sync_version_seq'`,
);
console.log(`cloud_sync_version_seq exists: ${seq.length > 0}`);
const cols = await sql.query(`
  select table_name from information_schema.columns
  where column_name = 'server_version'
    and table_name in ('web_conversations','web_messages','web_artifacts','user_memories','user_projects','user_settings')
  order by table_name`);
console.log(`server_version present on: ${cols.map((r) => r.table_name).join(', ')}`);
const art = await sql.query(
  `select 1 from information_schema.tables where table_name = 'web_artifacts'`,
);
console.log(`web_artifacts table exists: ${art.length > 0}`);
const rls = await sql.query(
  `select count(*)::int as n from pg_policies where policyname like '%user_isolation%'`,
);
console.log(`RLS isolation policies: ${rls[0]?.n}`);
console.log('\nPRODUCTION MIGRATIONS COMPLETE.');
