import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0411_connector_permission_generations.sql');
const down = read('down/0411_connector_permission_generations.down.sql');
const lib = (path: string) =>
  readFileSync(
    resolve(import.meta.dirname, '../../app/api/llm/v1/chat/completions/lib', path),
    'utf8',
  );

describe('0411 connector permission generations', () => {
  it('creates one owner-only counter per account and connector', () => {
    expect(up).toContain('NOT YET APPLIED : draft only, pending explicit approval before running.');
    expect(up).toContain('create table if not exists public.connector_permission_generations (');
    expect(up).toContain('user_id text not null references public.profiles(id) on delete cascade,');
    expect(up).toContain('generation bigint not null default 0 check (generation >= 0),');
    expect(up).toContain('primary key (user_id, connector_id)');
    expect(up).toContain(
      'alter table public.connector_permission_generations enable row level security;',
    );
    expect(up).toContain(
      'alter table public.connector_permission_generations force row level security;',
    );
    expect(up).toContain(
      'revoke all on public.connector_permission_generations from public, app_rls;',
    );
    expect(up).toContain(
      'grant select, insert, update on public.connector_permission_generations to app_rls;',
    );
    expect(up).not.toMatch(/grant[^;]*delete[^;]*connector_permission_generations/);
    expect(up).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(up).toContain('with check (user_id = (select public.current_app_user_id()))');
    expect(up).toMatch(/begin;[\s\S]*commit;/);
  });

  it('is the counter every permission change advances and every remembered approval locks', () => {
    expect(lib('connector-tool-session-grants.ts')).toContain(
      'do update set generation = connector_permission_generations.generation + 1',
    );
    const permissions = lib('connector-tool-permissions.ts');
    expect(permissions).toContain(
      'do update set generation = connector_permission_generations.generation\n',
    );
    expect(permissions).toContain('from public.connector_permission_generations');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain('drop policy if exists connector_permission_generations_owner');
    expect(down).toContain(
      'drop trigger if exists set_connector_permission_generations_updated_at',
    );
    expect(down).toContain('drop table if exists public.connector_permission_generations;');
    expect(down).toContain("where filename = '0411_connector_permission_generations.sql';");
    expect(down).toMatch(/begin;[\s\S]*commit;/);
  });
});
