import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_DAILY_TURN_LIMIT_MAX,
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTIONS_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  AGENT_OUTPUT_EXAMPLES_MAX_CHARS,
  AGENT_STARTERS_MAX,
  AGENT_STATUSES,
  AGENT_VISIBILITIES,
} from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0376_user_agents.sql');
const down = read('down/0376_user_agents.down.sql');

function policy(name: string): string {
  const match = up.match(new RegExp(`create policy ${name}[\\s\\S]*?;\\n`, 'i'));
  expect(match, name).not.toBeNull();
  return match![0];
}

function enumValues(column: string): string[] {
  const match = up.match(new RegExp(`${column} in \\(([^)]+)\\)`, 'i'));
  expect(match, column).not.toBeNull();
  return [...match![1]!.matchAll(/'([^']+)'/gu)].map((entry) => entry[1]!).sort();
}

describe('0376 user agents schema contract', () => {
  it('keeps the stored vocabularies and limits aligned with the wire contract', () => {
    expect(enumValues('status')).toEqual([...AGENT_STATUSES].sort());
    expect(enumValues('visibility')).toEqual([...AGENT_VISIBILITIES].sort());
    expect(up).toContain(`between 1 and ${AGENT_NAME_MAX_CHARS}`);
    expect(up).toContain(`char_length(description) <= ${AGENT_DESCRIPTION_MAX_CHARS}`);
    expect(up).toContain(`char_length(instructions) <= ${AGENT_INSTRUCTIONS_MAX_CHARS}`);
    expect(up).toContain(`char_length(output_examples) <= ${AGENT_OUTPUT_EXAMPLES_MAX_CHARS}`);
    expect(up).toContain(`cardinality(conversation_starters) <= ${AGENT_STARTERS_MAX}`);
    expect(up).toContain(`daily_turn_limit between 1 and ${AGENT_DAILY_TURN_LIMIT_MAX}`);
  });

  it('forces row security on every new table and shares only published agents in the active workspace', () => {
    for (const table of [
      'user_agents',
      'user_agent_versions',
      'user_agent_access',
      'user_agent_files',
    ]) {
      expect(up).toContain(`alter table public.${table} enable row level security;`);
      expect(up).toContain(`alter table public.${table} force row level security;`);
    }
    const shared = policy('user_agents_shared_read');
    expect(shared).toContain('for select to app_rls');
    expect(shared).toContain('published_version is not null');
    expect(shared).toContain("status <> 'retired'");
    expect(shared).toContain('organization_id = (select public.current_app_org_id())');
    expect(shared).toContain('public.app_org_resource_is_readable(organization_id)');
    expect(policy('user_agents_owner')).toContain(
      'user_id = (select public.current_app_user_id())',
    );
    expect(up).toMatch(/check \(visibility = 'private' or organization_id is not null\)/);
  });

  it('lets only the owner publish, grant to workspace members and change files', () => {
    expect(policy('user_agent_versions_publish')).toContain('public.app_owns_user_agent(agent_id)');
    const grant = policy('user_agent_access_grant');
    expect(grant).toContain('public.app_owns_user_agent(agent_id)');
    expect(grant).toContain('join public.organization_members member');
    expect(policy('user_agent_files_owner_insert')).toContain(
      'public.app_owns_user_agent(agent_id)',
    );
    expect(up).toMatch(/grant select, insert on public\.user_agent_versions to app_rls/);
  });

  it('keeps conversations and schedules when their agent is deleted', () => {
    expect(up).toMatch(
      /alter table public\.web_conversations\s+add column if not exists agent_id uuid references public\.user_agents\(id\) on delete set null/,
    );
    expect(up).toMatch(
      /alter table public\.scheduled_tasks\s+add column if not exists agent_id uuid references public\.user_agents\(id\) on delete set null/,
    );
  });

  it('exposes usage as counts only to the owner and transfers only inside the workspace', () => {
    expect(up).toMatch(
      /app_user_agent_usage[\s\S]*security definer[\s\S]*app_owns_user_agent\(target_agent_id\)/,
    );
    expect(up).toMatch(
      /app_transfer_user_agent[\s\S]*organization_members member[\s\S]*member\.user_id = new_owner_id/,
    );
  });

  it('rolls back every object it creates and its ledger entry', () => {
    expect(down.trim()).toMatch(/^begin;[\s\S]*commit;$/u);
    for (const object of [
      'drop table if exists public.user_agents;',
      'drop table if exists public.user_agent_versions;',
      'drop table if exists public.user_agent_access;',
      'drop table if exists public.user_agent_files;',
      'alter table public.web_conversations drop column if exists agent_id;',
      'alter table public.scheduled_tasks drop column if exists agent_id;',
      'drop function if exists public.app_owns_user_agent(uuid);',
      "where filename = '0376_user_agents.sql';",
    ]) {
      expect(down).toContain(object);
    }
  });
});
