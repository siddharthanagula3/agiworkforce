import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0404_upgrade_waitlist_access_checked_at.sql');
const down = read('down/0404_upgrade_waitlist_access_checked_at.down.sql');
const service = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/upgrade-waitlist-notice-service.ts'),
  'utf8',
);

describe('0404 upgrade waitlist access checked at', () => {
  it('adds the nullable column the waitlist scan orders by and stamps', () => {
    expect(up).toContain('NOT YET APPLIED : draft only');
    expect(up).toContain('alter table public.waitlist');
    expect(up).toContain('add column if not exists upgrade_access_checked_at timestamptz;');
    expect(up).not.toMatch(/upgrade_access_checked_at timestamptz\s+(not null|default)/);
    expect(service).toContain('max(waitlisted.upgrade_access_checked_at) nulls first');
    expect(service).toContain('set upgrade_access_checked_at = now()');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop column if exists upgrade_access_checked_at;');
    expect(down).toContain("where filename = '0404_upgrade_waitlist_access_checked_at.sql';");
  });
});
