import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROMPT_IDS } from '@/lib/prompts/prompt-manifest';
import { promptStamp } from '@/lib/prompts/prompt-registry';
import { isPromptStamp } from '@/lib/prompts/prompt-stamp';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0214_prompt_manifest_stamps.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0214_prompt_manifest_stamps.down.sql'),
  'utf8',
);

describe('prompt manifest stamps migration', () => {
  it('stamps both the cost ledger and the routing trace', () => {
    for (const table of ['provider_cost_events', 'routing_decision_traces']) {
      expect(migration).toContain(`alter table public.${table}`);
      expect(reversal).toContain(`drop column if exists prompt_ids`);
    }
    expect(migration.match(/add column if not exists prompt_ids text\[\]/g)).toHaveLength(2);
  });

  it('defaults to an empty array rather than null, so a group-by never drops a row', () => {
    expect(migration.match(/not null default '\{\}'::text\[\]/g)).toHaveLength(2);
  });

  it('indexes the stamps, because the whole point is grouping by them', () => {
    expect(migration).toContain('idx_provider_cost_events_prompt_ids');
    expect(migration).toContain('idx_routing_decision_traces_prompt_ids');
    expect(migration).toContain('using gin (prompt_ids)');
  });

  it('is reversible and drops itself from the applied set', () => {
    expect(reversal).toContain('delete from public.schema_migrations');
    expect(reversal).toContain('0214_prompt_manifest_stamps.sql');
  });

  it('stores the stamp every manifest prompt produces', () => {
    for (const id of PROMPT_IDS) {
      expect(isPromptStamp(promptStamp(id, 1))).toBe(true);
    }
  });
});
