import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0392_video_cancellation_wins_settlement.sql';
const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), 'utf8');
const previous = read('0105_durable_video_generation_jobs.sql');
const migration = read(MIGRATION);
const reversal = read('down/0392_video_cancellation_wins_settlement.down.sql');
const header = 'create or replace function public.finalize_video_generation_job(';
const providerQualifier = "    and v_job.provider = 'runway'\n";
const previousDefinition = previous.slice(
  previous.indexOf(header),
  previous.indexOf('\n\n-- A provider job', previous.indexOf(header)),
);
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '').trim();

describe('video cancellation wins settlement migration', () => {
  it('changes only the provider qualifier, preserving the full function and its grants', () => {
    expect(previousDefinition.startsWith(header)).toBe(true);
    expect(previousDefinition.split(providerQualifier)).toHaveLength(2);
    expect(withoutComments(migration)).toBe(
      withoutComments(`begin;\n\n${previousDefinition.replace(providerQualifier, '')}\n\ncommit;`),
    );
  });

  it('rejects completion after cancellation under the job lock before settlement', () => {
    const guard = "if p_outcome = 'completed'\n    and v_job.cancel_requested_at is not null then";
    const lockPosition = migration.indexOf('for update;');
    const guardPosition = migration.indexOf(guard);
    const settlementPosition = migration.indexOf('from public.finalize_managed_usage_request(');

    expect(lockPosition).toBeGreaterThan(-1);
    expect(guardPosition).toBeGreaterThan(lockPosition);
    expect(settlementPosition).toBeGreaterThan(guardPosition);
    expect(migration).toContain(
      "raise exception using errcode = '40001', message = 'video cancellation won finalization race';",
    );
  });

  it('restores the exact prior definition and grants with an atomic ledger retraction', () => {
    expect(withoutComments(reversal)).toBe(
      withoutComments(
        `begin;\n\n${previousDefinition}\n\ndelete from public.schema_migrations\nwhere filename = '${MIGRATION}';\n\ncommit;`,
      ),
    );
  });

  it('is the latest finalizer definition in the append-only migration chain', () => {
    const definitions = readdirSync(import.meta.dirname)
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
      .filter((file) => withoutComments(read(file)).includes(header));

    expect(definitions).toEqual(['0105_durable_video_generation_jobs.sql', MIGRATION]);
  });
});
