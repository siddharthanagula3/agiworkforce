import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const NEON_ROOT = path.resolve(import.meta.dirname, '../../db/neon');
const BOUNDARY_MIGRATION = '0110_active_workspace_content_scope.sql';

/**
 * The tables whose rows are the difference between a personal life and a job.
 * Each must take the active workspace as the default it is written with, or a
 * row created in one scope lands in the other.
 */
const CONTENT_TABLES = [
  'web_conversations',
  'user_projects',
  'web_artifacts',
  'user_memories',
  'search_history',
  'user_connectors',
  'user_custom_connectors',
  'scheduled_tasks',
  'cloud_agent_runs',
];

function migrationSource(): string {
  return fs.readFileSync(path.join(NEON_ROOT, BOUNDARY_MIGRATION), 'utf8');
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} is no longer defined in ${BOUNDARY_MIGRATION}`).toBeGreaterThan(-1);
  const open = source.indexOf('AS $$', start);
  const close = source.indexOf('$$;', open);
  return source.slice(open, close);
}

describe('personal and work are two places, not one place with a label', () => {
  const source = migrationSource();

  it('matches a row only when its workspace is the one the request is in', () => {
    const body = functionBody(source, 'app_row_is_visible');
    expect(body).toContain('row_org_id IS NOT DISTINCT FROM public.current_app_org_id()');
    expect(body).toContain('row_user_id = public.current_app_user_id()');
  });

  it('gives an administrator nothing outside their own workspace', () => {
    const body = functionBody(source, 'app_row_is_visible');
    const adminBranch = body.slice(body.indexOf('OR ('));

    // The administrator branch is the only way to reach another person's row,
    // and it is gated on a non-null workspace, so a personal row is unreachable.
    expect(adminBranch).toContain('row_org_id IS NOT NULL');
    expect(adminBranch).toContain("public.current_app_org_role() IN ('owner', 'admin')");
    expect(adminBranch).toContain('row_org_id = public.current_app_org_id()');
  });

  it('refuses a write that would land a row in a workspace the caller is not in', () => {
    const body = functionBody(source, 'app_row_is_writable');
    expect(body).toContain('row_org_id IS NOT DISTINCT FROM public.current_app_org_id()');
    expect(body).toContain('public.current_app_org_role() IS NOT NULL');
    expect(body, 'a write can reach another member than the caller').toContain(
      'row_user_id = public.current_app_user_id()',
    );
  });

  it('writes memory, history, connectors and projects into the active workspace', () => {
    const missing = CONTENT_TABLES.filter(
      (table) =>
        !new RegExp(
          `public\\.${table}\\s+ALTER COLUMN organization_id SET DEFAULT public\\.current_app_org_id\\(\\)`,
        ).test(source) &&
        !new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]{0,400}?current_app_org_id\\(\\)`).test(
          source,
        ),
    );
    expect(
      missing,
      `these carry content between a personal life and a job and are not bound to the active ` +
        `workspace: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('is never rewritten in place: a later migration is how this changes', () => {
    const later = fs
      .readdirSync(NEON_ROOT)
      .filter((name) => /^\d{4}_.*\.sql$/.test(name) && name > BOUNDARY_MIGRATION);
    expect(
      later.length,
      'the migration ledger stopped after the boundary was drawn',
    ).toBeGreaterThan(0);
  });
});
