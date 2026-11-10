import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0417_feedback_screenshot_cleanups.sql');
const down = read('down/0417_feedback_screenshot_cleanups.down.sql');
const cleanup = readFileSync(
  resolve(import.meta.dirname, '../../lib/server/feedback-screenshot-cleanup.ts'),
  'utf8',
);

describe('0417 feedback screenshot cleanups', () => {
  it('creates the table the route, the sweep and erasure read and write', () => {
    expect(up).toContain('create table if not exists public.feedback_screenshot_cleanups');
    expect(up).toContain('storage_key text primary key');
    expect(up).toMatch(/^\s+user_id text,$/m);
    expect(up).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(cleanup).toContain(
      'insert into public.feedback_screenshot_cleanups (storage_key, user_id)',
    );
    expect(cleanup).toContain('from public.feedback_screenshot_cleanups');
    expect(cleanup).toContain('delete from public.feedback_screenshot_cleanups');
  });

  it('leaves a signed-out report writable and ties the owner policy to the signed-in account', () => {
    expect(up).not.toMatch(/user_id text not null/);
    expect(up).toContain('enable row level security;');
    expect(up).toContain('force row level security;');
    expect(up).toContain('for all to app_rls');
    expect(up).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(up).toContain('with check (user_id = (select public.current_app_user_id()));');
    expect(up).toContain('revoke all on public.feedback_screenshot_cleanups from public, app_rls;');
    expect(up).toContain(
      'grant select, insert, delete on public.feedback_screenshot_cleanups to app_rls;',
    );
    expect(up).not.toMatch(/grant[^;]*\bupdate\b/i);
  });

  it('indexes the sweep and the erasure lookups without rewriting an existing table', () => {
    expect(up).toContain('on public.feedback_screenshot_cleanups (created_at);');
    expect(up).toContain('on public.feedback_screenshot_cleanups (user_id)');
    const statements = up.replace(/^--.*$/gm, '');
    expect(statements).not.toMatch(
      /public\.(?!feedback_screenshot_cleanups\b|current_app_user_id\b)\w+/,
    );
    expect(up).toMatch(/^begin;$/m);
    expect(up).toMatch(/^commit;$/m);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop table if exists public.feedback_screenshot_cleanups;');
    expect(down).toContain("where filename = '0417_feedback_screenshot_cleanups.sql';");
    expect(down).toContain('WHAT THIS COSTS');
  });
});
