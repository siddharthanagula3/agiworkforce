import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
// Canonical migrations live in apps/web/db/neon (Neon-compatible SQL).
const canonicalMigrationsDir = path.join(webRoot, 'db/neon');

function readCanonicalMigrations(): string {
  return readdirSync(canonicalMigrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(path.join(canonicalMigrationsDir, file), 'utf8'))
    .join('\n');
}

describe('Stripe webhook migration contract', () => {
  it('keeps webhook idempotency RPCs in canonical root migrations', () => {
    const sql = readCanonicalMigrations();

    // Functions exist in 0020_functions.sql. Neon does not use GRANT EXECUTE
    // (no service_role / authenticated / anon roles exist in Neon — see
    // 0020_functions.sql header comment "No GRANT/REVOKE to service_role").
    expect(sql).toContain('create or replace function public.process_stripe_event_idempotent');
    expect(sql).toContain('create or replace function public.mark_stripe_event_succeeded');
    expect(sql).toContain('create or replace function public.mark_stripe_event_failed');
  });
});
