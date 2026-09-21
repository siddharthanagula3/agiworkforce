const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export const DRILL_FIXTURE_USER = 'restore_drill_user';
export const DRILL_FIXTURE_ORGANIZATION = '00000000-0000-4000-8000-0000000d5111';
export const DRILL_FIXTURE_CONVERSATION = '00000000-0000-4000-8000-0000000d5222';
export const DRILL_FIXTURE_CREDIT = '00000000-0000-4000-8000-0000000d5333';
export const DRILL_FIXTURE_GRANT = '00000000-0000-4000-8000-0000000d5444';

/**
 * The seed writes rows, so it is allowed nowhere but a database on this
 * machine. A drill that can reach a shared host is a drill that can write to
 * one.
 */
export function isLoopbackConnection(connectionString) {
  try {
    const url = new URL(connectionString);
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Postgres refuses a bind that supplies a parameter the statement never names,
// so each statement carries exactly the values it references.
const SEED_STATEMENTS = [
  {
    text: `insert into public.profiles (id, email, display_name)
     values ($1, 'restore-drill@example.invalid', 'Restore Drill')
     on conflict (id) do nothing`,
    values: [DRILL_FIXTURE_USER],
  },
  {
    text: `insert into public.organizations (id, name, slug, created_by)
     values ($1::uuid, 'Restore Drill Org', 'restore-drill-org', $2)
     on conflict (id) do nothing`,
    values: [DRILL_FIXTURE_ORGANIZATION, DRILL_FIXTURE_USER],
  },
  {
    text: `insert into public.web_conversations (id, user_id, title, model)
     values ($1::uuid, $2, 'Restore drill conversation', 'drill-model')
     on conflict (id) do nothing`,
    values: [DRILL_FIXTURE_CONVERSATION, DRILL_FIXTURE_USER],
  },
  {
    text: `insert into public.token_credits
     (id, user_id, period_start, period_end, credits_allocated_cents, credits_used_cents)
     values ($1::uuid, $2, timestamptz '2026-01-01 00:00:00+00',
             timestamptz '2026-02-01 00:00:00+00', 5000, 1234)
     on conflict (id) do nothing`,
    values: [DRILL_FIXTURE_CREDIT, DRILL_FIXTURE_USER],
  },
  {
    text: `insert into public.connector_oauth_grants
     (id, user_id, connector_id, access_token_enc, token_endpoint)
     values ($1::uuid, $2, 'restore-drill-connector', 'ciphertext-fixture',
             'https://connector.example.invalid/token')
     on conflict (id) do nothing`,
    values: [DRILL_FIXTURE_GRANT, DRILL_FIXTURE_USER],
  },
];

// An empty database restores an empty database, which proves the commands ran
// and nothing about whether data survives them, so every compared table gets a row.
export async function seedDrillFixtures(query) {
  for (const statement of SEED_STATEMENTS) {
    await query(statement.text, statement.values);
  }
  return SEED_STATEMENTS.length;
}

export async function fingerprintTable(query, table) {
  const rows = await query(
    `select coalesce(md5(string_agg(row_text, '|' order by row_text)), 'empty') as fingerprint
       from (select r::text as row_text from ${table} r) source_rows`,
  );
  return rows[0]?.fingerprint ?? null;
}

export async function fingerprintTables(query, tables) {
  const fingerprints = {};
  for (const table of tables) {
    fingerprints[table] = await fingerprintTable(query, table);
  }
  return fingerprints;
}

export function compareFingerprints(sourceFingerprints, targetFingerprints, tables) {
  const comparisons = {};
  const mismatched = [];
  for (const table of tables) {
    const source = sourceFingerprints[table] ?? null;
    const target = targetFingerprints[table] ?? null;
    const match = source !== null && source === target;
    comparisons[table] = { source, target, match };
    if (!match) mismatched.push(table);
  }
  return { comparisons, mismatched, pass: mismatched.length === 0 };
}
