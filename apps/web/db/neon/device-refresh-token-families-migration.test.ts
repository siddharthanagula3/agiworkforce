import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0411_device_refresh_token_families.sql');
const down = read('down/0411_device_refresh_token_families.down.sql');
const family = readFileSync(
  resolve(import.meta.dirname, '../../lib/server/refresh-token-family.ts'),
  'utf8',
);
const admission = readFileSync(
  resolve(import.meta.dirname, '../../lib/server/developer-token.ts'),
  'utf8',
);

describe('0411 device refresh token families', () => {
  it('creates one row per family with a revoked_at that the code fences on', () => {
    expect(up).toContain('NOT YET APPLIED : draft only, pending explicit approval before running.');
    expect(up).toContain('create table if not exists public.device_refresh_token_families (');
    expect(up).toContain('family_id uuid primary key,');
    expect(up).toContain('user_id text not null,');
    expect(up).toMatch(/revoked_at timestamptz,/);
    expect(up).toContain(
      'revoke all on public.device_refresh_token_families from public, app_rls;',
    );
    expect(up).toContain(
      'grant select, insert, update on public.device_refresh_token_families to app_rls;',
    );
    expect(up).not.toMatch(/grant [^;]*delete[^;]* on public\.device_refresh_token_families/);
    expect(up).toContain('before update on public.device_refresh_token_families');
    expect(up).toContain(
      'if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then',
    );
    expect(up.trim().startsWith('--')).toBe(true);
    expect(up).toMatch(/begin;[\s\S]*commit;/);
  });

  it('is the table rotation locks and every revocation ends first', () => {
    expect(family).toContain(
      'insert into public.device_refresh_token_families (family_id, user_id)',
    );
    expect(family).toContain('returning family_id, revoked_at');
    expect(family).toContain(
      'set revoked_at = coalesce(device_refresh_token_families.revoked_at, excluded.revoked_at)',
    );
    expect(admission).toContain('FROM public.device_refresh_token_families f');
    expect(admission).toContain('f.revoked_at IS NOT NULL');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop table if exists public.device_refresh_token_families;');
    expect(down).toContain('drop index if exists public.idx_device_refresh_token_families_user;');
    expect(down).toContain(
      'drop function if exists public.device_refresh_token_families_stay_ended();',
    );
    expect(down).toContain("where filename = '0411_device_refresh_token_families.sql';");
    expect(down).toMatch(/begin;[\s\S]*commit;/);
  });
});
