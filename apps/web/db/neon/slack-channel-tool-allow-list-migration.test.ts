import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLACK_CHANNEL_TOOLS } from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0385_slack_channel_tool_allow_list.sql');
const down = read('down/0385_slack_channel_tool_allow_list.down.sql');

describe('0385 slack channel tool allow-list', () => {
  it('keeps every existing channel unrestricted', () => {
    expect(up).toContain('add column if not exists allowed_tools text[];');
    expect(up).not.toMatch(/allowed_tools text\[\][^;]*not null/);
    expect(up).not.toMatch(/^update public\.slack_channel_policies/m);
  });

  it('accepts exactly the tool groups the contract names', () => {
    const groups = SLACK_CHANNEL_TOOLS.map((tool) => `'${tool}'`).join(', ');
    expect(up).toContain(`allowed_tools <@ array[${groups}]::text[]`);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain(
      'alter table public.slack_channel_policies drop column if exists allowed_tools;',
    );
    expect(down).toContain("where filename = '0385_slack_channel_tool_allow_list.sql';");
  });
});
