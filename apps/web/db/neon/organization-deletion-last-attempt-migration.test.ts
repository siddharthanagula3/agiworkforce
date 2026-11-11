import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0406_organization_deletion_last_attempt.sql');
const down = read('down/0406_organization_deletion_last_attempt.down.sql');
const cron = readFileSync(
  resolve(import.meta.dirname, '../../app/api/cron/purge-deleted-organizations/route.ts'),
  'utf8',
);

describe('0406 organization deletion last attempt', () => {
  it('adds the nullable attempt stamp the purge cron reads and writes', () => {
    expect(up).toContain('NOT YET APPLIED');
    expect(up).toContain('alter table public.organizations');
    expect(up).toContain('add column if not exists deletion_last_attempt_at timestamptz;');
    expect(up).not.toMatch(/deletion_last_attempt_at timestamptz\s+(not null|default)/);
    expect(up).not.toMatch(/deletion_scheduled_for\s*=/);
    expect(cron).toContain('set deletion_last_attempt_at = now()');
    expect(cron).toContain('order by deletion_last_attempt_at asc nulls first');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop column if exists deletion_last_attempt_at;');
    expect(down).toContain("where filename = '0406_organization_deletion_last_attempt.sql';");
  });
});
