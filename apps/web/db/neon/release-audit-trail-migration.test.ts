import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RELEASE_AUDIT_RETENTION_DAYS,
  RELEASE_ENVIRONMENTS,
  RELEASE_EVENTS,
  RELEASE_OUTCOMES,
  RELEASE_SOURCES,
  RELEASE_SURFACES,
} from '@/lib/server/release-audit-store';

const migrationsDir = join(process.cwd(), 'db/neon');
const MIGRATION = '0263_release_audit_trail.sql';

function executableSql(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const sql = executableSql(join(migrationsDir, MIGRATION));
const down = executableSql(join(migrationsDir, 'down', '0263_release_audit_trail.down.sql'));

describe('0263 — append-only release audit trail', () => {
  it('accepts exactly the vocabulary the store sends', () => {
    for (const value of [
      ...RELEASE_EVENTS,
      ...RELEASE_SURFACES,
      ...RELEASE_ENVIRONMENTS,
      ...RELEASE_OUTCOMES,
      ...RELEASE_SOURCES,
    ]) {
      expect(sql).toContain(`'${value}'`);
    }
  });

  it('refuses UPDATE and DELETE through a trigger rather than through a grant', () => {
    expect(sql).toMatch(/before update or delete on public\.release_events/i);
    expect(sql).toContain('release_events_are_append_only');
  });

  it('lets a row age out only after the window the store states', () => {
    expect(sql).toContain(`interval '${RELEASE_AUDIT_RETENTION_DAYS} days'`);
    expect(sql).toMatch(/tg_op = 'DELETE' and old\.recorded_at </i);
  });

  it('chains under a lock so two writers cannot claim one predecessor', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toMatch(/order by id desc\s+limit 1/i);
  });

  it('starts the chain from a genesis hash rather than from null', () => {
    expect(sql).toContain("repeat('0', 64)");
  });

  it('keeps the trail out of the tenant-scoped role entirely', () => {
    expect(sql).toContain('revoke all on public.release_events from app_rls');
  });

  it('requires a reason on a failure so the trail is never a bare "failed"', () => {
    expect(sql).toMatch(/outcome <> 'failed' or reason is not null/i);
  });

  it('has a down migration that removes the writer with the table', () => {
    expect(down).toContain('drop function if exists public.append_release_event');
    expect(down).toContain('drop table if exists public.release_events');
  });
});
