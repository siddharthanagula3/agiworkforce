import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 0100 exists so "which roles administer an organization" has one answer in
 * SQL. The regression it guards against is silent and cheap to make: someone
 * retypes the pair at a thirteenth site, or replaces `app_row_is_visible`
 * again and reinstates the inline list. Both are pinned here.
 */
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
    // `null = any (...)` is NULL. A policy reads that as "not true", but a CHECK
    // constraint or an application query would not, so it is collapsed here.
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
    // Every policy from 0073 onward references this function by name. Dropping
    // it would cascade to those policies; `create or replace` keeps the
    // signature and swaps only the body.
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
    // Owner-of-the-row, active-org match, and the NOT NULL org guard are the
    // three conditions 0073 established; losing any one of them widens reads.
    expect(body).toMatch(/row_user_id = public\.current_app_user_id\(\)/i);
    expect(body).toMatch(/row_org_id is not null/i);
    expect(body).toMatch(/row_org_id = public\.current_app_org_id\(\)/i);
  });
});
