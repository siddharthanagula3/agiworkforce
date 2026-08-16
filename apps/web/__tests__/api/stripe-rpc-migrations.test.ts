import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
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

    expect(sql).toContain('create or replace function public.process_stripe_event_idempotent');
    expect(sql).toContain('create or replace function public.mark_stripe_event_succeeded');
    expect(sql).toContain('create or replace function public.mark_stripe_event_failed');
  });
});
