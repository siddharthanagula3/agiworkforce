import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const canonicalMigrationsDir = path.join(repoRoot, 'supabase/migrations');

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

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.process_stripe_event_idempotent');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_stripe_event_succeeded');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_stripe_event_failed');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.process_stripe_event_idempotent');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_stripe_event_succeeded');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_stripe_event_failed');
  });
});
