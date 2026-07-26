import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 0073 is the tenancy floor every enterprise capability sits on. These are
 * source-level invariants in the same spirit as the other migration guards: the
 * dangerous regressions here are silent (a policy that stops failing closed, a
 * backfill that reclassifies personal rows as workspace rows), so they are
 * pinned rather than left to review.
 */
const CONTENT_TABLES = [
  'web_conversations',
  'user_projects',
  'web_artifacts',
  'user_memories',
  'media_assets',
  'scheduled_tasks',
  'cloud_agent_runs',
  'user_connectors',
  'user_custom_connectors',
  'api_keys',
  'managed_usage_requests',
  'usage_events',
];

describe('tenancy foundation migration (0073)', () => {
  const load = () => readFile(join(process.cwd(), 'db/neon/0073_tenancy_foundation.sql'), 'utf8');

  it('adds a nullable organization_id to every content root', async () => {
    const sql = await load();
    for (const table of CONTENT_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+add column if not exists organization_id uuid`,
          'i',
        ),
      );
    }
  });

  it('never backfills, so every existing row stays personal', async () => {
    const sql = await load();
    // A backfill would silently reclassify personal history as workspace-owned
    // and expose it to org admins. NULL must remain the migration's only value.
    expect(sql).not.toMatch(/update\s+public\.\w+\s+set\s+organization_id/i);
    expect(sql).not.toMatch(/organization_id\s+uuid\s+not null/i);
    expect(sql).not.toMatch(/organization_id[^\n]*default\s+(?!null)/i);
  });

  it('resolves the active org from a GUC that fails closed when unset', async () => {
    const sql = await load();
    expect(sql).toMatch(/create or replace function public\.current_app_org_id/i);
    expect(sql).toMatch(/nullif\(current_setting\('request\.jwt\.claim\.org_id', true\), ''\)/i);
  });

  it('reads the org role from the membership table, never from a client claim', async () => {
    const sql = await load();
    expect(sql).toMatch(/create or replace function public\.current_app_org_role/i);
    expect(sql).toMatch(/from public\.organization_members/i);
    // A forged `org_role` claim must not be able to grant admin.
    expect(sql).not.toMatch(/current_setting\('request\.jwt\.claim\.org_role'/i);
  });

  it('pins search_path on the SECURITY DEFINER role lookup', async () => {
    const sql = await load();
    expect(sql).toMatch(/security definer[\s\S]{0,120}set search_path = public, pg_temp/i);
    expect(sql).toMatch(/revoke all on function public\.current_app_org_role\(\) from public/i);
  });

  it('grants org visibility only to owner/admin of the ACTIVE org', async () => {
    const sql = await load();
    expect(sql).toMatch(/row_org_id is not null/i);
    expect(sql).toMatch(/row_org_id = public\.current_app_org_id\(\)/i);
    expect(sql).toMatch(/current_app_org_role\(\) in \('owner', 'admin'\)/i);
  });

  it('refuses to let a caller file a row into an org they do not belong to', async () => {
    const sql = await load();
    expect(sql).toMatch(/create or replace function public\.app_row_is_writable/i);
    // Ownership is still required on write, and the org must resolve to a real
    // membership — otherwise tenancy could be forged from the client.
    expect(sql).toMatch(/row_user_id = public\.current_app_user_id\(\)\s*\n?\s*and/i);
    expect(sql).toMatch(/current_app_org_role\(\) is not null/i);
  });

  it('closes the media_assets RLS gap left open since 0036', async () => {
    const sql = await load();
    expect(sql).toMatch(/alter table public\.media_assets enable row level security/i);
    expect(sql).toMatch(/alter table public\.media_assets force row level security/i);
  });

  it('routes every content policy through the one shared predicate', async () => {
    const sql = await load();
    expect(sql).toMatch(/using \(public\.app_row_is_visible\(user_id, organization_id\)\)/i);
    expect(sql).toMatch(/with check \(public\.app_row_is_writable\(user_id, organization_id\)\)/i);
    for (const table of CONTENT_TABLES) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it('keeps policies bound to the non-BYPASSRLS app_rls role', async () => {
    const sql = await load();
    expect(sql).toMatch(/for all to app_rls/i);
    expect(sql).toMatch(
      /grant execute on function public\.app_row_is_visible\(text, uuid\) to app_rls/i,
    );
  });
});
