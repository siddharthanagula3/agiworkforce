import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin role helper migration (0100)', () => {
  const load = (file: string) => readFile(join(process.cwd(), 'db/neon', file), 'utf8');

  it('defines the canonical role list and its scalar predicate', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    expect(sql).toMatch(/create or replace function public\.app_org_admin_roles\(\)/i);
    expect(sql).toMatch(/select array\['owner', 'admin'\]::text\[\]/i);
    expect(sql).toMatch(
      /create or replace function public\.app_is_org_admin_role\(candidate_role text\)/i,
    );
    expect(sql).toMatch(/any \(public\.app_org_admin_roles\(\)\)/i);
  });

  it('treats an unknown role as false rather than NULL', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    expect(sql).toMatch(
      /coalesce\(candidate_role = any \(public\.app_org_admin_roles\(\)\), false\)/i,
    );
  });

  it('rewires the tenancy predicate instead of inlining the pair again', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    const body = sql.slice(sql.search(/create or replace function public\.app_row_is_visible/i));
    expect(body).toMatch(/public\.app_is_org_admin_role\(public\.current_app_org_role\(\)\)/i);
    expect(body).not.toMatch(/'owner'/i);
  });

  it('replaces app_row_is_visible in place, so no live policy is dropped', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    expect(sql).toMatch(
      /create or replace function public\.app_row_is_visible\(row_user_id text, row_org_id uuid\)/i,
    );
    expect(sql).not.toMatch(/drop\s+(function|policy)/i);
  });

  it('keeps the helpers executable by the RLS role and nobody else', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    for (const signature of ['app_org_admin_roles\\(\\)', 'app_is_org_admin_role\\(text\\)']) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${signature} from public`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${signature} to app_rls`, 'i'),
      );
    }
  });

  it('preserves the 0073 visibility rule verbatim apart from the role test', async () => {
    const sql = await load('0100_admin_role_helper.sql');
    const body = sql.slice(sql.search(/create or replace function public\.app_row_is_visible/i));
    expect(body).toMatch(/row_user_id = public\.current_app_user_id\(\)/i);
    expect(body).toMatch(/row_org_id is not null/i);
    expect(body).toMatch(/row_org_id = public\.current_app_org_id\(\)/i);
  });
});
