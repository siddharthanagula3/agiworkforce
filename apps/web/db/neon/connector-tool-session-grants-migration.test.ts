import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRUST_MODE_CONTRACTS } from '@agiworkforce/types';
import { TOOL_APPROVAL_RISK_TIERS } from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0364_connector_tool_session_grants.sql');
const down = read('down/0364_connector_tool_session_grants.down.sql');
const policies = up.match(/create policy[\s\S]*?\n {2}\);/giu) ?? [];
const policyFor = (command: string) =>
  policies.find((value) => value.includes(`for ${command} to app_rls`));

describe('conversation connector grant schema contract', () => {
  it('binds grants to the existing account and conversation keys with cascading erasure', () => {
    expect(read('0002_profiles.sql')).toMatch(/id text primary key/i);
    expect(read('0001_mvp_chat.sql')).toMatch(/id uuid primary key/i);
    expect(up).toMatch(
      /user_id text not null references public\.profiles\(id\) on delete cascade/i,
    );
    expect(up).toMatch(
      /conversation_id uuid not null references public\.web_conversations\(id\) on delete cascade/i,
    );
    expect(up).toMatch(
      /unique \(user_id, conversation_id, connector_id, tool_name, trust_boundary\)/i,
    );
  });

  it('keeps the stored trust and risk vocabularies aligned with their runtime owners', () => {
    const values = (column: string) => {
      const match = up.match(new RegExp(`${column} in \\(([^)]+)\\)`, 'i'));
      expect(match).not.toBeNull();
      return [...match![1]!.matchAll(/'([^']+)'/gu)].map((entry) => entry[1]).sort();
    };
    expect(values('trust_boundary')).toEqual(
      Object.values(TRUST_MODE_CONTRACTS)
        .map((mode) => mode.mode)
        .sort(),
    );
    expect(values('risk_tier')).toEqual([...TOOL_APPROVAL_RISK_TIERS].sort());
    expect(up).toMatch(/risk_tier text not null/i);
    expect(up).toMatch(/destructive boolean not null/i);
  });

  it('permits only read, insert and revocation, with forced row security', () => {
    expect(up).toMatch(/revoke all on public\.connector_tool_session_grants from public, app_rls/i);
    expect(up).toMatch(
      /grant select, insert, delete on public\.connector_tool_session_grants to app_rls/i,
    );
    expect(up).toMatch(/enable row level security/i);
    expect(up).toMatch(/force row level security/i);
    expect(policies).toHaveLength(3);
    for (const command of ['select', 'insert', 'delete']) {
      const policy = policyFor(command);
      expect(policy).toBeDefined();
      expect(policy).toContain('user_id = (select public.current_app_user_id())');
      expect(policy).toContain('conversation.id = connector_tool_session_grants.conversation_id');
      expect(policy).toContain('conversation.user_id = connector_tool_session_grants.user_id');
      expect(policy).toContain(
        'conversation.organization_id is not distinct from (select public.current_app_org_id())',
      );
    }
    expect(policyFor('insert')).toContain('conversation.deleted_at is null');
    expect(policyFor('insert')).toContain('conversation.is_temporary = false');
  });

  it('keeps the grants of a trashed or temporary conversation readable and revocable', () => {
    for (const command of ['select', 'delete']) {
      const policy = policyFor(command);
      expect(policy).toBeDefined();
      expect(policy).not.toMatch(/deleted_at|is_temporary/u);
    }
  });

  it('starts without grants and rolls back only its own new table and ledger entry', () => {
    expect(up).not.toMatch(
      /(?:insert into|update) public\.(?:web_conversations|user_memories|cloud_agent_runs|connector_tool_session_grants)/i,
    );
    expect(down.trim()).toMatch(/^begin;[\s\S]*commit;$/u);
    expect(down).toContain('drop table if exists public.connector_tool_session_grants;');
    expect(down).toContain("where filename = '0364_connector_tool_session_grants.sql'");
    expect(down).not.toMatch(/drop (?:function|role|column)/i);
  });
});
