import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_MONTHLY_CREDIT_LIMIT_MAX } from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0374_slack_channel_policy_and_agent_credit_cap.sql');
const down = read('down/0374_slack_channel_policy_and_agent_credit_cap.down.sql');

describe('0374 slack channel policy and agent credit cap', () => {
  it('lets only the installer set a channel and keeps three modes', () => {
    expect(up).toMatch(/mode text not null check \(mode in \('off', 'answer', 'task'\)\)/);
    expect(up).toContain('alter table public.slack_channel_policies force row level security;');
    expect(up).toMatch(
      /slack_channel_policies_installer_write[\s\S]*installation\.installed_by_user_id = \(select public\.current_app_user_id\(\)\)/,
    );
  });

  it('caps an agent in credits within the contract range and sums only its own spend', () => {
    expect(up).toContain(`monthly_credit_limit between 1 and ${AGENT_MONTHLY_CREDIT_LIMIT_MAX}`);
    expect(up).toMatch(/app_user_agent_month_spend[\s\S]*security definer/);
    expect(up).toContain(
      '(conversation.agent_id = target_agent_id or task.agent_id = target_agent_id)',
    );
    expect(up).toContain("date_trunc('month', now() at time zone 'utc')");
    expect(up).toMatch(/where exists \(select 1 from readable\)/);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop function if exists public.app_user_agent_month_spend(uuid);');
    expect(down).toContain(
      'alter table public.user_agents drop column if exists monthly_credit_limit;',
    );
    expect(down).toContain('drop table if exists public.slack_channel_policies;');
    expect(down).toContain(
      "where filename = '0374_slack_channel_policy_and_agent_credit_cap.sql';",
    );
  });
});
