import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_DIR = import.meta.dirname;
const MIGRATION =
  fs
    .readdirSync(MIGRATION_DIR)
    .find((name) => name.endsWith('_projects_follow_workspace_deletion.sql')) ?? '';
const SOURCE = MIGRATION ? fs.readFileSync(path.join(MIGRATION_DIR, MIGRATION), 'utf8') : '';
const DOWN = MIGRATION
  ? fs.readFileSync(
      path.join(MIGRATION_DIR, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
      'utf8',
    )
  : '';
const OWNER_GUARD_MIGRATION = '0217_shared_project_editor_write.sql';
const SOURCE_GUARD_MIGRATION = '0419_project_knowledge_object_lifecycle.sql';
const read = (name: string) => fs.readFileSync(path.join(MIGRATION_DIR, name), 'utf8');

function functionBody(source: string, name: string): string {
  const start = source.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(\\)`));
  const body = source.indexOf('as $$', start);
  const end = source.indexOf('$$;', body);
  return start === -1 || body === -1 || end === -1 ? '' : source.slice(body, end);
}

function code(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const OWNER_GUARD = functionBody(SOURCE, 'user_projects_owner_column_guard');
const SOURCE_GUARD = functionBody(SOURCE, 'guard_project_knowledge_object_scope');
const CASCADE_ONLY =
  'new.user_id is distinct from old.user_id or old.organization_id is null or new.organization_id is not null or exists (select 1 from public.organizations where id = old.organization_id)';
const SOURCE_BRANCH = SOURCE_GUARD.slice(
  SOURCE_GUARD.indexOf('if (new.user_id is distinct from old.user_id'),
);

describe('a member project demotes to Personal when its workspace is deleted', () => {
  it('replaces the 0217 and 0419 guards in place, after both', () => {
    expect(MIGRATION).not.toBe('');
    expect(OWNER_GUARD).not.toBe('');
    expect(SOURCE_GUARD).not.toBe('');
    expect(Number(MIGRATION.slice(0, 4))).toBeGreaterThan(
      Number(SOURCE_GUARD_MIGRATION.slice(0, 4)),
    );
    expect(SOURCE).not.toMatch(/create trigger|drop trigger|drop function|alter table/i);
    expect(code(SOURCE)).toMatch(/^begin; .* commit;$/);
  });

  it('lets the owner guard pass only the cascade for a session that is not the owner', () => {
    expect(code(OWNER_GUARD)).toContain(
      `and old.user_id is distinct from public.current_app_user_id() and (${CASCADE_ONLY}) then raise exception 'only the project owner may move a project to another owner or organization' using errcode = '42501';`,
    );
  });

  it('lets the source guard pass only the cascade for a project holding stored sources', () => {
    expect(code(SOURCE_BRANCH)).toContain(
      `if ${CASCADE_ONLY} then raise exception 'Project source ownership cannot change without a reviewed source transfer' using errcode = '23514'; end if;`,
    );
  });

  it('detaches the ledger rows the demoted project still references, in the same statement', () => {
    const branch = code(SOURCE_BRANCH);
    expect(branch).toContain(
      "update public.project_knowledge_objects objects set organization_id = null, updated_at = now() where objects.organization_id = old.organization_id and objects.fingerprint in ( select public.project_knowledge_object_fingerprint(k.storage_uri) from public.project_knowledge_files k where k.project_id = old.id and k.deleted_at is null and nullif(k.storage_uri, '') is not null )",
    );
    expect(branch.indexOf('update public.project_knowledge_objects')).toBeGreaterThan(
      branch.indexOf('raise exception'),
    );
  });

  it('keeps the 0419 retirement fence exactly as written', () => {
    const fence = (body: string) =>
      code(body.slice(0, body.indexOf('if (new.user_id is distinct from old.user_id')));
    const original = functionBody(
      read(SOURCE_GUARD_MIGRATION),
      'guard_project_knowledge_object_scope',
    );
    expect(fence(SOURCE_GUARD)).toBe(fence(original));
    expect(fence(SOURCE_GUARD)).toContain(
      "current_setting('transaction_isolation') <> 'read committed'",
    );
  });

  it('keeps the source guard out of reach of the application role', () => {
    expect(SOURCE).toContain(
      'revoke all on function public.guard_project_knowledge_object_scope() from public, app_rls;',
    );
  });

  it('reverses to both earlier guards verbatim and retracts its ledger row', () => {
    expect(code(functionBody(DOWN, 'user_projects_owner_column_guard'))).toBe(
      code(functionBody(read(OWNER_GUARD_MIGRATION), 'user_projects_owner_column_guard')),
    );
    expect(code(functionBody(DOWN, 'guard_project_knowledge_object_scope'))).toBe(
      code(functionBody(read(SOURCE_GUARD_MIGRATION), 'guard_project_knowledge_object_scope')),
    );
    expect(code(DOWN)).toContain(
      `delete from public.schema_migrations where filename = '${MIGRATION}';`,
    );
    expect(code(DOWN)).toMatch(/^begin; .* commit;$/);
  });
});
