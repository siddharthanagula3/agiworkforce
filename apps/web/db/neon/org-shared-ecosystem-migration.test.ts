import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 0086 is the sharing floor. The dangerous regressions here are silent — a
 * policy that stops fencing on `organization_id`, a predicate that quietly
 * starts admitting non-members, a "simplification" that folds sharing back into
 * 0073's governance predicate and hands every member their admins' API keys.
 * None of those produce a runtime failure in a repo with no live Postgres in
 * tests, so they are pinned at the source level here, exactly like
 * `tenancy-foundation-migration.test.ts` pins 0073.
 */
const SHARING_TABLES = [
  'organization_shared_projects',
  'organization_project_access',
  'organization_shared_connectors',
];

describe('org shared ecosystem migration (0086)', () => {
  const load = () => readFile(join(process.cwd(), 'db/neon/0086_org_shared_ecosystem.sql'), 'utf8');
  const loadTenancy = () =>
    readFile(join(process.cwd(), 'db/neon/0073_tenancy_foundation.sql'), 'utf8');

  it('creates the three sharing relations and nothing resembling the dropped teams shape', async () => {
    const sql = await load();
    for (const table of SHARING_TABLES) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    }
    // 0058 dropped `teams`/`team_members` because a second membership system
    // with its own role vocabulary is exactly what made last-owner protection
    // impossible. Sharing must hang off organizations/organization_members.
    expect(sql).not.toMatch(/create table[^;]*\bpublic\.teams\b/i);
    expect(sql).not.toMatch(/create table[^;]*\bpublic\.team_members\b/i);
    expect(sql).not.toMatch(/\beditor\b/i);
  });

  it('does not widen the 0073 governance predicate', async () => {
    const sql = await load();
    // The one-line "fix" that would ship a catastrophe: adding 'member' to
    // app_row_is_visible, which is applied by twelve policies including
    // api_keys, usage_events and user_memories.
    expect(sql).not.toMatch(/create or replace function public\.app_row_is_visible/i);
    expect(sql).not.toMatch(/create or replace function public\.app_row_is_writable/i);
    // And 0073 itself must still be owner/admin-only.
    const tenancy = await loadTenancy();
    expect(tenancy).toMatch(/current_app_org_role\(\) in \('owner', 'admin'\)/i);
    expect(tenancy).not.toMatch(/current_app_org_role\(\) in \([^)]*'member'/i);
  });

  it('resolves sharing membership from the table, never from a client claim', async () => {
    const sql = await load();
    expect(sql).toMatch(/create or replace function public\.app_org_resource_is_readable/i);
    expect(sql).toMatch(/create or replace function public\.app_org_resource_is_manageable/i);
    // app_has_org_role (0076) is SECURITY DEFINER over organization_members.
    expect(sql).toMatch(/public\.app_has_org_role\(/i);
    // A forged org GUC must not be able to grant a shared read.
    expect(sql).not.toMatch(/current_setting\('request\.jwt\.claim\.org_id'/i);
  });

  it('fails closed on a null organization id', async () => {
    const sql = await load();
    const readable = sql.slice(
      sql.indexOf('function public.app_org_resource_is_readable'),
      sql.indexOf('function public.app_org_resource_is_manageable'),
    );
    expect(readable).toMatch(/row_org_id is not null/i);
    const manageable = sql.slice(sql.indexOf('function public.app_org_resource_is_manageable'));
    expect(manageable.slice(0, 400)).toMatch(/row_org_id is not null/i);
  });

  it('lets members read the share set but only owner/admin change it', async () => {
    const sql = await load();
    for (const table of SHARING_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `create policy ${table}_member_read\\s+on public\\.${table} for select to app_rls\\s+using \\(public\\.app_org_resource_is_readable\\(organization_id\\)\\)`,
          'i',
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `create policy ${table}_admin_write\\s+on public\\.${table} for all to app_rls\\s+using \\(public\\.app_org_resource_is_manageable\\(organization_id\\)\\)\\s+with check \\(public\\.app_org_resource_is_manageable\\(organization_id\\)\\)`,
          'i',
        ),
      );
    }
  });

  it('keeps every sharing table under FORCE row level security on the non-BYPASSRLS role', async () => {
    const sql = await load();
    for (const table of SHARING_TABLES) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} force row level security`, 'i'),
      );
    }
    // Every policy in this file must name app_rls; a policy without a role
    // grant applies to PUBLIC and would be readable by the owner connection's
    // role set in future refactors.
    const policyClauses = sql.match(/create policy [\s\S]*?(?=;\s*(?:--|\n|$))/gi) ?? [];
    expect(policyClauses.length).toBeGreaterThanOrEqual(8);
    for (const clause of policyClauses) {
      expect(clause).toMatch(/to app_rls/i);
    }
  });

  it('scopes every sharing policy on organization_id — the cross-org fence', async () => {
    const sql = await load();
    for (const table of SHARING_TABLES) {
      const block = sql.slice(sql.indexOf(`create policy ${table}_member_read`));
      // Deleting the organization_id argument is precisely the regression that
      // would let org A read org B's shared set.
      expect(block.slice(0, 300)).toMatch(/\(organization_id\)/);
    }
  });

  it('shares projects through a grant row, never by rewriting user_projects.organization_id', async () => {
    const sql = await load();
    // Overloading 0073's column would make "an admin may audit this" and "every
    // member may open this" the same bit — un-sharing would also un-govern.
    expect(sql).not.toMatch(/update\s+public\.user_projects\s+set\s+organization_id/i);
    expect(sql).toMatch(/primary key \(organization_id, project_id\)/i);
    expect(sql).toMatch(/references public\.user_projects\(id\) on delete cascade/i);
  });

  it('widens user_projects for SELECT only, leaving 0073 the sole write gate', async () => {
    const sql = await load();
    const start = sql.indexOf('create policy user_projects_org_shared_read');
    const policy = sql.slice(start, sql.indexOf('project_knowledge_files', start));
    expect(policy).toMatch(/for select to app_rls/i);
    // A `for all` here would let any org member UPDATE or DELETE another
    // member's project.
    expect(policy.slice(0, 200)).not.toMatch(/for all/i);
    expect(policy).not.toMatch(/with check/i);
  });

  it('honours an explicit per-member denial in the database, not only in the route', async () => {
    const sql = await load();
    const policy = sql.slice(
      sql.indexOf('create policy user_projects_org_shared_read'),
      sql.indexOf('project_knowledge_files'),
    );
    expect(policy).toMatch(/organization_project_access/);
    expect(policy).toMatch(/a\.access = 'none'/);
    expect(policy).toMatch(/a\.user_id = public\.current_app_user_id\(\)/);
  });

  it('cascades per-member grants off membership so revocation cannot be forgotten', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /references public\.organization_members \(organization_id, user_id\)\s+on delete cascade/i,
    );
  });

  it('re-points project_knowledge_files at the project, and keeps write owner-only', async () => {
    const sql = await load();
    const start = sql.indexOf('create policy project_knowledge_files_tenant_isolation');
    const policy = sql.slice(start, sql.indexOf('comment on table', start));
    expect(policy).toMatch(/organization_shared_projects/);
    // The WITH CHECK side must stay owner-only in this slice: members read
    // knowledge files on a shared project, they do not write them.
    const withCheck = policy.slice(policy.indexOf('with check'));
    expect(withCheck).not.toMatch(/organization_shared_projects/);
    expect(withCheck).toMatch(/p\.user_id = public\.current_app_user_id\(\)/);
  });

  it('gives the org quota function the same fail-closed contract as its 0060 sibling', async () => {
    const sql = await load();
    expect(sql).toMatch(/create or replace function public\.assert_org_resource_limit/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/if p_limit is null then\s+return true/i);
    expect(sql).toMatch(/invalid_org_resource_limit/);
    expect(sql).toMatch(/unknown_org_resource/);
    // The advisory lock must be taken BEFORE the count, or two admins sharing
    // the last connector both see a free slot.
    const body = sql.slice(sql.indexOf('function public.assert_org_resource_limit'));
    const lockAt = body.indexOf('pg_advisory_xact_lock');
    const countAt = body.indexOf('select count(*) into v_count');
    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
    expect(body).toMatch(/hashtextextended\('agi:org-resource:'/);
    expect(body).toMatch(/org_resource_limit_reached'\s*\n?\s*using errcode = 'P0001'/);
  });

  it('never backfills, so every existing project and connector stays personal', async () => {
    const sql = await load();
    expect(sql).not.toMatch(/insert into public\.organization_shared_projects\s+select/i);
    expect(sql).not.toMatch(/insert into public\.organization_shared_connectors\s+select/i);
  });

  it('gives shared connectors an org-stable id distinct from the personal namespace', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /org_short_id text not null check \(org_short_id ~ '\^\[0-9a-f\]\{10\}\$'\)/i,
    );
    expect(sql).toMatch(
      /create unique index if not exists idx_org_shared_connectors_short_id\s+on public\.organization_shared_connectors \(organization_id, org_short_id\)/i,
    );
  });

  it('never exposes the connector credential column through a sharing policy', async () => {
    const sql = await load();
    // Sharing a connector shares the EFFECT of its bearer token, not the token.
    expect(sql).not.toMatch(/auth_header_enc/);
    // And it must not add a member-readable policy to the credential table.
    expect(sql).not.toMatch(/create policy[^;]*on public\.user_custom_connectors/i);
  });
});
