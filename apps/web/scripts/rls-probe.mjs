#!/usr/bin/env node
/**
 * rls-probe.mjs — [Tranche-1] Alpha's Runtime Skeptic: Cross-Tenant Denial Probe
 *
 * Proves the RLS floor actually isolates tenants. Run against a THROWAWAY Neon
 * branch (a COW clone of production) AFTER apply-rls.mjs. Never run against
 * production — FORCE RLS without the live path setting the GUC would deny the
 * live app.
 *
 * CRITICAL DEPLOY FINDING this probe enforces: a Postgres role with the
 * BYPASSRLS attribute (Neon's default owner role HAS it) bypasses ALL policies
 * regardless of FORCE ROW LEVEL SECURITY. RLS therefore isolates tenants ONLY
 * when the app connects as a NON-BYPASSRLS role. This probe:
 *   - reports whether the connection role bypasses RLS (a production blocker if so),
 *   - then verifies the POLICIES under a dedicated NON-BYPASSRLS role via SET ROLE
 *     (the correct way to test RLS — the owner is exempt by design).
 *
 * PASS conditions (all must hold):
 *   1. All 10 user-scoped tables have rowsecurity = true AND forcerowsecurity = true.
 *   2. Under a non-bypass role bound to user A, user B's rows are NOT visible.
 *   3. Under that role, UPDATE of B's row affects 0 rows.
 *   4. Under that role, INSERT with user_id = B is REJECTED by WITH CHECK (42501).
 *
 * The GUC is set via set_config('request.jwt.claim.sub', <user>, true) — the
 * transaction-local form current_app_user_id() reads.
 *
 * USAGE:
 *   DATABASE_URL="<branch-connection-string>" node apps/web/scripts/rls-probe.mjs
 *
 * Exits 0 on PASS, non-zero on FAIL.
 */
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[rls-probe] FATAL: DATABASE_URL env var is required.');
  process.exit(1);
}

const USER_A = 'rls_probe_userA';
const USER_B = 'rls_probe_userB';
// The REAL non-bypass application role created by 0037 (apply-rls runs first).
// Testing under it validates both the policies AND the role's grants/membership.
const PROBE_ROLE = 'app_rls';
const RLS_TABLES = [
  'web_conversations',
  'web_messages',
  'profiles',
  'subscriptions',
  'token_credits',
  'credit_transactions',
  'api_keys',
  'user_projects',
  'project_knowledge_files',
  'user_memories',
];

const failures = [];
const warnings = [];
function check(ok, msg) {
  if (ok) console.log(`  PASS  ${msg}`);
  else {
    console.error(`  FAIL  ${msg}`);
    failures.push(msg);
  }
}

async function main() {
  const client = new Client(DATABASE_URL);
  await client.connect();
  try {
    // --- 1. RLS enabled + forced on all 10 tables -------------------------
    console.log('[rls-probe] (1) RLS flags on user-scoped tables');
    const { rows: flagRows } = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname = ANY($1)`,
      [RLS_TABLES],
    );
    const flagByName = new Map(flagRows.map((r) => [r.relname, r]));
    for (const t of RLS_TABLES) {
      const r = flagByName.get(t);
      check(
        !!r && r.relrowsecurity === true && r.relforcerowsecurity === true,
        `${t}: rowsecurity+forcerowsecurity enabled`,
      );
    }

    // --- 1b. Surface whether the LIVE connection role bypasses RLS --------
    const { rows: su } = await client.query(
      `SELECT rolsuper, rolbypassrls, rolcreaterole
         FROM pg_roles WHERE rolname = current_user`,
    );
    const role = su[0] || {};
    if (role.rolsuper || role.rolbypassrls) {
      const w =
        `connection role "${''}" bypasses RLS (superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}). ` +
        `PRODUCTION BLOCKER: the app must connect as a NON-BYPASSRLS, non-superuser role or RLS does NOTHING. ` +
        `Verifying policies below under a dedicated non-bypass role.`;
      console.warn(`  WARN  ${w}`);
      warnings.push(w);
    } else {
      console.log('  INFO  connection role does not bypass RLS');
    }

    // --- 2. Seed one row per user (as the privileged role; bypasses checks) -
    console.log('[rls-probe] (2) seed one user_memories row per tenant');
    await client.query('DELETE FROM public.user_memories WHERE user_id = ANY($1)', [
      [USER_A, USER_B],
    ]);
    for (const u of [USER_A, USER_B]) {
      await client.query('INSERT INTO public.user_memories (user_id, content) VALUES ($1, $2)', [
        u,
        `probe-${u}`,
      ]);
    }
    check(true, 'seeded one row per tenant');

    // --- 2b. Verify the real app_rls role exists and is non-bypass --------
    const { rows: prRows } = await client.query(
      'SELECT rolbypassrls FROM pg_roles WHERE rolname = $1',
      [PROBE_ROLE],
    );
    if (prRows.length === 0) {
      failures.push(`role "${PROBE_ROLE}" not found — apply-rls.mjs (0037) must create it first`);
    } else if (prRows[0].rolbypassrls === true) {
      failures.push(`role "${PROBE_ROLE}" unexpectedly has BYPASSRLS — it must be NOBYPASSRLS`);
    } else {
      // --- 3. Under the non-bypass role bound to A: deny cross-tenant ------
      console.log(`[rls-probe] (3) cross-tenant denial under ${PROBE_ROLE} bound to user A`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${PROBE_ROLE}`);
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [USER_A]);

      const { rows: seeB } = await client.query(
        'SELECT count(*)::int AS n FROM public.user_memories WHERE user_id = $1',
        [USER_B],
      );
      check(seeB[0].n === 0, `A cannot SELECT B's rows (saw ${seeB[0].n}, expect 0)`);

      const { rows: seeOwn } = await client.query(
        "SELECT count(*)::int AS n FROM public.user_memories WHERE content LIKE 'probe-rls_probe_%'",
      );
      check(seeOwn[0].n === 1, `A sees only its own probe row (saw ${seeOwn[0].n}, expect 1)`);

      const upd = await client.query(
        "UPDATE public.user_memories SET content = 'hacked' WHERE user_id = $1",
        [USER_B],
      );
      check(upd.rowCount === 0, `A's UPDATE of B's rows affects 0 rows (affected ${upd.rowCount})`);

      let insertRejected = false;
      let insertErrCode = null;
      try {
        await client.query('INSERT INTO public.user_memories (user_id, content) VALUES ($1, $2)', [
          USER_B,
          'evil-cross-tenant',
        ]);
      } catch (e) {
        insertRejected = true;
        insertErrCode = e.code; // 42501 = insufficient_privilege (RLS WITH CHECK)
      }
      check(
        insertRejected && insertErrCode === '42501',
        `A's INSERT with user_id=B is REJECTED by WITH CHECK (code=${insertErrCode ?? 'none'})`,
      );

      // Failed INSERT aborts the txn; roll back (also resets ROLE + GUC).
      await client.query('ROLLBACK');
    }

    // --- 4. Cleanup (branch is disposable, but keep it tidy) --------------
    await client.query('DELETE FROM public.user_memories WHERE user_id = ANY($1)', [
      [USER_A, USER_B],
    ]);
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    if (warnings.length) {
      console.warn(`\n[rls-probe] ${warnings.length} production warning(s):`);
      warnings.forEach((w) => console.warn(`  ! ${w}`));
    }
    if (failures.length === 0) {
      console.log(
        '\nRLS PROBE: PASS — policies deny cross-tenant read AND write under a non-bypass role.',
      );
      process.exit(0);
    }
    console.error(`\nRLS PROBE: FAIL — ${failures.length} check(s) failed:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  })
  .catch((err) => {
    console.error('\nRLS PROBE: FAIL (probe error):', err.message || err);
    process.exit(1);
  });
