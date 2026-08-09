import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FIRST_REVERSIBLE_MIGRATION,
  declaredObjects,
  reversalErrors,
  unreversedObjects,
} from '../../../../scripts/check-neon-migrations.mjs';

const migrationsDir = join(process.cwd(), 'db/neon');
const downDir = join(migrationsDir, 'down');
const repoRoot = resolve(process.cwd(), '../..');
const tempDirs: string[] = [];

afterAll(() => {
  for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
});

function sqlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

const reversibleMigrations = sqlFiles(migrationsDir).filter(
  (filename) => Number(filename.slice(0, 4)) >= FIRST_REVERSIBLE_MIGRATION,
);

describe('down migration contract', () => {
  // Every rule below is worth nothing if the script does not execute. Comparing
  // `import.meta.url` (which Node realpaths) against a raw `process.argv[1]`
  // made the whole checker exit 0 in silence whenever the repo was reached
  // through a symlink — no output, no findings, no failure.
  it('runs its checks when invoked through a symlinked path', () => {
    const linkDir = mkdtempSync(join(tmpdir(), 'neon-check-'));
    tempDirs.push(linkDir);
    const link = join(linkDir, 'repo');
    symlinkSync(repoRoot, link, 'dir');

    const result = spawnSync(process.execPath, [join(link, 'scripts/check-neon-migrations.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    // Pass or fail is the tree's business; producing a verdict at all is this
    // test's business.
    expect(`${result.stdout}${result.stderr}`).toMatch(/Neon migration check (passed|failed)/);
  });

  it('covers every migration in the reversible window', () => {
    const reversals = new Set(sqlFiles(downDir));

    expect(reversibleMigrations.length).toBeGreaterThan(0);
    for (const filename of reversibleMigrations) {
      expect(reversals).toContain(filename.replace(/\.sql$/, '.down.sql'));
    }
  });

  it.each(reversibleMigrations)('%s ships a reversal that satisfies the contract', (filename) => {
    const upSql = readFileSync(join(migrationsDir, filename), 'utf8');
    const downSql = readFileSync(join(downDir, filename.replace(/\.sql$/, '.down.sql')), 'utf8');

    expect(reversalErrors(filename, upSql, downSql)).toEqual([]);
  });

  it('reads every object shape a migration in this repo declares', () => {
    const objects = declaredObjects(`
      create table if not exists public.widgets (id uuid primary key);
      create index if not exists idx_widgets_owner on public.widgets(owner_id);
      create policy widgets_isolation on public.widgets for all to app_rls using (true);
      create or replace function public.widget_count() returns integer language sql as $$ select 1 $$;
      alter table public.gadgets
        add column if not exists widget_id uuid,
        add constraint gadgets_widget_fk foreign key (widget_id) references public.widgets(id);
      drop index if exists public.idx_gadgets_legacy;
    `);

    expect(objects).toEqual([
      { kind: 'table', name: 'widgets', table: null },
      { kind: 'index', name: 'idx_widgets_owner', table: 'widgets' },
      { kind: 'policy', name: 'widgets_isolation', table: 'widgets' },
      { kind: 'function', name: 'widget_count', table: null },
      { kind: 'column', name: 'widget_id', table: 'gadgets' },
      { kind: 'constraint', name: 'gadgets_widget_fk', table: 'gadgets' },
      { kind: 'index', name: 'idx_gadgets_legacy', table: null },
    ]);
  });

  it('reads the shapes beyond CREATE TABLE that a migration can change', () => {
    const objects = declaredObjects(`
      create or replace view public.widget_summary as select 1;
      create sequence public.widget_seq;
      create type public.widget_state as enum ('on', 'off');
      alter table public.widgets alter column payload type jsonb;
      alter table public.widgets rename column old_name to new_name;
      alter table public.widgets enable row level security;
      alter table public.gadgets rename to gizmos;
    `);

    expect(objects).toEqual([
      { kind: 'view', name: 'widget_summary', table: null },
      { kind: 'sequence', name: 'widget_seq', table: null },
      { kind: 'type', name: 'widget_state', table: null },
      { kind: 'column', name: 'payload', table: 'widgets' },
      { kind: 'column', name: 'old_name', table: 'widgets' },
      { kind: 'column', name: 'new_name', table: 'widgets' },
      { kind: 'row level security on', name: 'widgets', table: 'widgets' },
      { kind: 'table', name: 'gizmos', table: null },
    ]);
  });

  it('leaves CREATE EXTENSION and GRANT out of the contract on purpose', () => {
    // pg_trgm is cluster-wide and shared (0101 installs it); a reversal that
    // dropped it would take every other migration's trigram index with it.
    expect(
      declaredObjects(`
        create extension if not exists pg_trgm;
        grant select on public.widgets to app_rls;
      `),
    ).toEqual([]);
  });

  it('tracks a repeated column name per table rather than collapsing them', () => {
    // The shape of 0073, which adds organization_id to six content roots.
    const up = `
      alter table public.a add column if not exists organization_id uuid;
      alter table public.b add column if not exists organization_id uuid;
      alter table public.c add column if not exists organization_id uuid;
    `;
    const down = `
      begin;
      alter table public.a drop column if exists organization_id;
      commit;
    `;

    expect(unreversedObjects(up, down)).toEqual([
      { kind: 'column', name: 'organization_id', table: 'b' },
      { kind: 'column', name: 'organization_id', table: 'c' },
    ]);
  });

  it('reports the object a reversal forgot when a migration grows one', () => {
    const up = `
      create table public.widgets (id uuid primary key);
      create table public.sprockets (id uuid primary key);
    `;
    const down = 'begin; drop table if exists public.widgets; commit;';

    expect(unreversedObjects(up, down)).toEqual([
      { kind: 'table', name: 'sprockets', table: null },
    ]);
  });

  it('counts an index and a policy as reversed when the reversal drops their table', () => {
    const up = `
      create table public.widgets (id uuid primary key);
      create index idx_widgets_owner on public.widgets(owner_id);
      create policy widgets_isolation on public.widgets for all to app_rls using (true);
    `;

    expect(unreversedObjects(up, 'begin; drop table public.widgets; commit;')).toEqual([]);
  });

  it('refuses a reversal that leaves the ledger claiming the migration is applied', () => {
    const errors: string[] = reversalErrors(
      '0104_key_version.sql',
      'create table public.widgets (id uuid primary key);',
      'begin; drop table public.widgets; commit;',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('must delete its own ledger row');
  });

  it('refuses a reversal that is not one transaction, unless it says why', () => {
    const up = 'create index idx_widgets_owner on public.widgets(owner_id);';
    const ledger = "delete from public.schema_migrations where filename = '0104_key_version.sql';";
    const loose = `drop index if exists public.idx_widgets_owner; ${ledger}`;

    expect(reversalErrors('0104_key_version.sql', up, loose)).toEqual([
      expect.stringContaining('must open with BEGIN'),
      expect.stringContaining('must end with COMMIT'),
    ]);
    expect(
      reversalErrors(
        '0104_key_version.sql',
        up,
        '-- non-transactional: DROP INDEX CONCURRENTLY cannot run in a transaction block.\n' +
          `drop index concurrently if exists public.idx_widgets_owner; ${ledger}`,
      ),
    ).toEqual([]);
  });

  it('refuses the atomicity waiver when nothing in the file needs it', () => {
    const ledger = "delete from public.schema_migrations where filename = '0104_key_version.sql';";

    expect(
      reversalErrors(
        '0104_key_version.sql',
        'create index idx_widgets_owner on public.widgets(owner_id);',
        `-- non-transactional: I would rather not wrap this.\n` +
          `drop index if exists public.idx_widgets_owner; ${ledger}`,
      ),
    ).toEqual([expect.stringContaining("declares '-- non-transactional:'")]);
  });

  it('rejects an empty reversal outright rather than reading it as complete', () => {
    const errors: string[] = reversalErrors(
      '0104_key_version.sql',
      'create table public.widgets (id uuid primary key);',
      '-- TODO: write this\n',
    );

    expect(errors).toEqual([expect.stringContaining('has no SQL')]);
  });
});
