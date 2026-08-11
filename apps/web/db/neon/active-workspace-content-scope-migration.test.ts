import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONTENT_TABLES = [
  'web_conversations',
  'user_projects',
  'web_artifacts',
  'user_memories',
  'scheduled_tasks',
  'cloud_agent_runs',
  'user_connectors',
  'user_custom_connectors',
  'api_keys',
  'managed_usage_requests',
  'usage_events',
] as const;

describe('active workspace content scope migration (0110)', () => {
  const load = () =>
    readFile(join(process.cwd(), 'db/neon/0110_active_workspace_content_scope.sql'), 'utf8');

  it('requires an owner row to match the active Personal or organization scope', async () => {
    const sql = await load();

    expect(sql).toMatch(
      /row_user_id = public\.current_app_user_id\(\)[\s\S]{0,100}row_org_id is not distinct from public\.current_app_org_id\(\)/i,
    );
    expect(sql).not.toMatch(/select\s+row_user_id = public\.current_app_user_id\(\)\s+or/i);
  });

  it('retains active-organization owner/admin visibility without exposing Personal rows', async () => {
    const sql = await load();

    expect(sql).toMatch(/row_org_id is not null/i);
    expect(sql).toMatch(/row_org_id = public\.current_app_org_id\(\)/i);
    expect(sql).toMatch(/current_app_org_role\(\) in \('owner', 'admin'\)/i);
  });

  it('requires writes to match the active scope and a real membership for org rows', async () => {
    const sql = await load();

    expect(sql).toMatch(/create or replace function public\.app_row_is_writable/i);
    expect(sql).toMatch(/row_org_id is not distinct from public\.current_app_org_id\(\)/i);
    expect(sql).toMatch(/row_org_id is null[\s\S]{0,80}current_app_org_role\(\) is not null/i);
  });

  it('defaults every RLS content root to the validated request workspace', async () => {
    const sql = await load();

    for (const table of CONTENT_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+alter column organization_id set default public\\.current_app_org_id\\(\\)`,
          'i',
        ),
      );
    }
  });

  it('keeps media assets explicit because durable generation captures workspace provenance', async () => {
    const sql = await load();

    expect(sql).not.toMatch(
      /alter table public\.media_assets\s+alter column organization_id set default/i,
    );
  });

  it('does not backfill or reclassify existing Personal rows', async () => {
    const sql = await load();

    expect(sql).not.toMatch(/update\s+public\.\w+\s+set\s+organization_id/i);
    expect(sql).not.toMatch(/organization_id\s+set\s+not\s+null/i);
  });

  it('keeps search history and every search RPC inside the same active scope', async () => {
    const sql = await load();

    expect(sql).toMatch(
      /alter table public\.search_history[\s\S]{0,120}add column if not exists organization_id uuid/i,
    );
    for (const functionName of [
      'track_search',
      'get_recent_searches',
      'get_popular_searches',
      'get_search_suggestions',
      'clear_search_history',
    ]) {
      expect(sql).toContain(`FUNCTION public.${functionName}`);
    }
    expect(sql.match(/organization_id IS NOT DISTINCT FROM p_organization_id/g)).toHaveLength(4);
  });
});
