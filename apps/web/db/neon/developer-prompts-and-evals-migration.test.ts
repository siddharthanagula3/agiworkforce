import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_EVAL_CASES_MAX,
  DEVELOPER_EVAL_CHECK_KINDS,
  DEVELOPER_PROMPT_NAME_MAX_CHARS,
  DEVELOPER_PROMPT_TEXT_MAX_CHARS,
} from '@agiworkforce/cloud-contracts';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0371_developer_prompts_and_evals.sql');
const down = read('down/0371_developer_prompts_and_evals.down.sql');
const TABLES = [
  'developer_prompts',
  'developer_prompt_versions',
  'developer_eval_cases',
  'developer_eval_runs',
  'developer_eval_results',
];

describe('0371 developer prompts and evaluations schema contract', () => {
  it('keeps limits and vocabularies aligned with the wire contract', () => {
    expect(up).toContain(`between 1 and ${DEVELOPER_PROMPT_NAME_MAX_CHARS}`);
    expect(up).toContain(`char_length(template) between 1 and ${DEVELOPER_PROMPT_TEXT_MAX_CHARS}`);
    expect(up).toContain(`case_count between 1 and ${DEVELOPER_EVAL_CASES_MAX}`);
    const kinds = up.match(/check_kind in \(([^)]+)\)/)![1]!;
    expect([...kinds.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...DEVELOPER_EVAL_CHECK_KINDS].sort(),
    );
  });

  it('forces owner-only row security on every table, with versions append-only', () => {
    for (const table of TABLES) {
      expect(up).toContain(`alter table public.${table} force row level security;`);
      expect(up).toMatch(
        new RegExp(
          `create policy ${table}_owner[\\s\\S]*?user_id = \\(select public.current_app_user_id\\(\\)\\)`,
        ),
      );
    }
    expect(up).toContain('grant select, insert on public.developer_prompt_versions to app_rls;');
    expect(up).toContain(
      'constraint developer_prompt_versions_number_unique unique (prompt_id, version)',
    );
    expect(up).toContain(
      'constraint developer_eval_results_has_outcome check (output is not null or error is not null)',
    );
  });

  it('rolls back every table and its ledger entry', () => {
    for (const table of TABLES) expect(down).toContain(`drop table if exists public.${table};`);
    expect(down).toContain("where filename = '0371_developer_prompts_and_evals.sql';");
  });
});
