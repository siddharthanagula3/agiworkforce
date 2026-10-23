import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_EFFORTS } from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0389_agent_reasoning_effort.sql');
const down = read('down/0389_agent_reasoning_effort.down.sql');

describe('0389 agent reasoning effort', () => {
  it('adds a nullable effort limited to the contract levels', () => {
    expect(up).toContain('add column if not exists effort text');
    expect(up).toContain(
      `effort is null or effort in (${AGENT_EFFORTS.map((effort) => `'${effort}'`).join(', ')})`,
    );
    expect(up).not.toMatch(/effort text\s+not null/);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('alter table public.user_agents drop column if exists effort;');
    expect(down).toContain("where filename = '0389_agent_reasoning_effort.sql';");
  });
});
