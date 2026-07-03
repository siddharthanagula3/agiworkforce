#!/usr/bin/env node
/**
 * apply-rls.mjs — [Tranche-1] idempotent applier for 0037_rls_user_isolation.sql
 *
 * Applies the RLS policy migration to the database named by DATABASE_URL. The
 * migration is idempotent (CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS,
 * ENABLE/FORCE RLS), so re-running is safe.
 *
 * USAGE (branch-first — NEVER point this at production until the probe passes):
 *   neon branches create --name tranche1-rls-probe
 *   DATABASE_URL="<branch-connection-string>" node apps/web/scripts/apply-rls.mjs
 *
 * Exits non-zero on any error.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// The serverless driver needs a WebSocket implementation under Node.
neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[apply-rls] FATAL: DATABASE_URL env var is required.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, '..', 'db', 'neon', '0037_rls_user_isolation.sql');

async function main() {
  const sql = readFileSync(migrationPath, 'utf8');
  const client = new Client(DATABASE_URL);
  await client.connect();
  try {
    // Single simple-protocol query runs all statements (incl. the dollar-quoted
    // function body) server-side in order.
    await client.query(sql);
    // Confirm the helper and a sample policy landed.
    const { rows } = await client.query(
      `SELECT count(*)::int AS n
         FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE '%_user_isolation'`,
    );
    console.log(`[apply-rls] applied 0037; ${rows[0].n} user-isolation policies present.`);
    if (rows[0].n < 10) {
      console.error(`[apply-rls] WARNING: expected 10 policies, found ${rows[0].n}.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[apply-rls] FAILED:', err.message || err);
  process.exit(1);
});
