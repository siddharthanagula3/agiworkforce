#!/usr/bin/env node
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.AGI_DATABASE_URL });
const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectReject(name, sql, params = []) {
  try {
    await client.query(sql, params);
    record(name, false, 'statement was ACCEPTED but should have been rejected');
  } catch (error) {
    record(name, true, `rejected: ${String(error.message).slice(0, 90)}`);
  }
}

await client.connect();

const rls = await client.query(
  `select relname, relrowsecurity, relforcerowsecurity
     from pg_class
    where relname in ('consent_records','data_rights_requests')
    order by relname`,
);
for (const row of rls.rows) {
  record(
    `${row.relname}: RLS enabled and FORCED`,
    row.relrowsecurity === true && row.relforcerowsecurity === true,
    `enabled=${row.relrowsecurity} forced=${row.relforcerowsecurity}`,
  );
}
record('both tables exist', rls.rows.length === 2, `found ${rls.rows.length}`);

for (const table of ['consent_records', 'data_rights_requests']) {
  const grants = await client.query(
    `select privilege_type from information_schema.role_table_grants
      where table_name = $1 and grantee = 'app_rls'`,
    [table],
  );
  const held = new Set(grants.rows.map((r) => r.privilege_type));
  record(
    `${table}: app_rls has SELECT+INSERT`,
    held.has('SELECT') && held.has('INSERT'),
    [...held].join(',') || 'none',
  );
  record(
    `${table}: app_rls has NO UPDATE/DELETE (append-only)`,
    !held.has('UPDATE') && !held.has('DELETE'),
    [...held].join(',') || 'none',
  );
}

const policies = await client.query(
  `select tablename, policyname from pg_policies
    where tablename in ('consent_records','data_rights_requests')`,
);
record(
  'both isolation policies exist',
  policies.rows.length === 2,
  policies.rows.map((r) => r.policyname).join(', '),
);

await expectReject(
  'consent_records: rejects a row naming no subject',
  `insert into public.consent_records (user_id, subject_email_sha256, purpose, granted, notice_version, surface)
   values (null, null, 'product_updates', true, '2026-08-11', 'web-consent-centre')`,
);

const hash = 'a'.repeat(64);
const inserted = await client.query(
  `insert into public.consent_records (user_id, subject_email_sha256, purpose, granted, notice_version, surface)
   values (null, $1, 'enterprise_waitlist', true, '2026-08-11', 'web-waitlist-inline')
   returning purpose, granted, notice_version, surface, recorded_at`,
  [hash],
);
record(
  'consent_records: accepts a valid anonymous consent',
  inserted.rows.length === 1 && inserted.rows[0].granted === true,
  JSON.stringify(inserted.rows[0]?.purpose),
);

await client.query(
  `insert into public.consent_records (user_id, subject_email_sha256, purpose, granted, notice_version, surface)
   values (null, $1, 'enterprise_waitlist', false, '2026-08-11', 'web-consent-centre')`,
  [hash],
);
const history = await client.query(
  `select granted from public.consent_records
    where subject_email_sha256 = $1 and purpose = 'enterprise_waitlist'
    order by recorded_at desc, granted asc`,
  [hash],
);
record(
  'consent_records: withdrawal is a new row, grant survives',
  history.rows.length === 2,
  `${history.rows.length} rows retained`,
);

const live = await client.query(
  `select distinct on (purpose) purpose, granted
     from public.consent_records
    where subject_email_sha256 = $1
    order by purpose, recorded_at desc`,
  [hash],
);
record(
  'consent_records: distinct-on read returns one live row per purpose',
  live.rows.length === 1,
  JSON.stringify(live.rows),
);

await expectReject(
  'data_rights_requests: rejects an unknown request_type',
  `insert into public.data_rights_requests (reference, contact_email, request_type)
   values ('DPDP-BADTYPE01', 'x@example.com', 'sell_my_data')`,
);
await expectReject(
  'data_rights_requests: rejects an unknown status',
  `insert into public.data_rights_requests (reference, contact_email, request_type, status)
   values ('DPDP-BADSTAT01', 'x@example.com', 'access', 'ignored')`,
);

const req = await client.query(
  `insert into public.data_rights_requests (reference, user_id, contact_email, request_type, details)
   values ('DPDP-VERIFY0001', null, 'verify@example.com', 'erasure', 'verification row')
   returning reference, request_type, status`,
);
record(
  'data_rights_requests: accepts a valid anonymous request, defaults status',
  req.rows[0]?.status === 'received',
  JSON.stringify(req.rows[0]),
);

await expectReject(
  'data_rights_requests: reference is unique',
  `insert into public.data_rights_requests (reference, contact_email, request_type)
   values ('DPDP-VERIFY0001', 'other@example.com', 'access')`,
);

const idx = await client.query(
  `select indexname from pg_indexes
    where tablename in ('consent_records','data_rights_requests')
    order by indexname`,
);
const names = idx.rows.map((r) => r.indexname);
for (const expected of [
  'idx_consent_records_user_purpose',
  'idx_consent_records_email_purpose',
  'idx_data_rights_requests_user',
  'idx_data_rights_requests_open',
]) {
  record(`index present: ${expected}`, names.includes(expected));
}

const triggerRow = await client.query(
  `select tgname from pg_trigger
    where tgrelid = 'public.consent_records'::regclass and not tgisinternal`,
);
record(
  'consent_records: append-only trigger installed',
  triggerRow.rows.some((r) => r.tgname === 'consent_records_append_only'),
  triggerRow.rows.map((r) => r.tgname).join(', ') || 'none',
);

const VERIFY_USER = 'dpdp_verify_user_delete_me';
await client.query(
  `insert into public.profiles (id, email) values ($1, 'dpdp-verify@example.invalid')
   on conflict (id) do nothing`,
  [VERIFY_USER],
);
await client.query(
  `insert into public.consent_records (user_id, subject_email_sha256, purpose, granted, notice_version, surface)
   values ($1, null, 'product_updates', true, '2026-08-11', 'web-consent-centre')`,
  [VERIFY_USER],
);

await client.query('grant update, delete on public.consent_records to app_rls');
await client.query('set role app_rls');
await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [VERIFY_USER]);
try {
  const visible = await client.query(
    `select count(*)::int as n from public.consent_records where user_id = $1`,
    [VERIFY_USER],
  );
  record(
    'consent_records: row is visible to app_rls (so the trigger is really reached)',
    visible.rows[0].n === 1,
    `${visible.rows[0].n} row(s) visible`,
  );

  await expectReject(
    'consent_records: trigger blocks UPDATE even after a blanket re-grant',
    `update public.consent_records set granted = false where user_id = $1`,
    [VERIFY_USER],
  );
  await expectReject(
    'consent_records: trigger blocks DELETE even after a blanket re-grant',
    `delete from public.consent_records where user_id = $1`,
    [VERIFY_USER],
  );
} finally {
  await client.query('reset role');
  await client.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await client.query('revoke update, delete on public.consent_records from app_rls');
}

const ownerDelete = await client.query(`delete from public.consent_records where user_id = $1`, [
  VERIFY_USER,
]);
record(
  'consent_records: OWNER can still delete (account erasure keeps working)',
  ownerDelete.rowCount === 1,
  `${ownerDelete.rowCount} row(s) deleted`,
);
await client.query(`delete from public.profiles where id = $1`, [VERIFY_USER]);

await client.query(`delete from public.consent_records where subject_email_sha256 = $1`, [hash]);
await client.query(`delete from public.data_rights_requests where reference = 'DPDP-VERIFY0001'`);
const leftover = await client.query(
  `select (select count(*)::int from public.consent_records
             where subject_email_sha256 in ($1, $2) or user_id = $3) as mine_consents,
          (select count(*)::int from public.data_rights_requests
             where reference = 'DPDP-VERIFY0001') as mine_requests,
          (select count(*)::int from public.profiles where id = $3) as mine_profiles`,
  [hash, 'b'.repeat(64), VERIFY_USER],
);
const { mine_consents, mine_requests, mine_profiles } = leftover.rows[0];
record(
  'verification rows cleaned up (only this script’s rows are counted)',
  mine_consents === 0 && mine_requests === 0 && mine_profiles === 0,
  JSON.stringify(leftover.rows[0]),
);

await client.end();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
