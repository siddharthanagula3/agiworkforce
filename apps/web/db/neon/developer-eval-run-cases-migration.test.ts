import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0407_developer_eval_run_cases.sql');
const down = read('down/0407_developer_eval_run_cases.down.sql');
const service = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/developer-prompt-service.ts'),
  'utf8',
);

describe('0407 developer eval run cases', () => {
  it('freezes one row per admitted case, keyed by run and case, without a case foreign key', () => {
    expect(up).toContain('create table if not exists public.developer_eval_run_cases');
    expect(up).toContain(
      'run_id uuid not null references public.developer_eval_runs(id) on delete cascade',
    );
    expect(up).toContain('case_id uuid not null,');
    expect(up).not.toMatch(/case_id uuid not null references/);
    expect(up).toContain('primary key (run_id, case_id)');
    expect(up).toContain("check (jsonb_typeof(variables) = 'object')");
    expect(up).toContain('char_length(expected_output) <= 32000');
  });

  it('adds a nullable expected_output to results so old rows stay valid', () => {
    expect(up).toContain('alter table public.developer_eval_results');
    expect(up).toContain('add column if not exists expected_output text');
    expect(up).not.toMatch(/expected_output text\s+not null/);
  });

  it('forces owner-only row security and keeps the frozen set append-only', () => {
    expect(up).toContain('alter table public.developer_eval_run_cases force row level security;');
    expect(up).toContain('grant select, insert on public.developer_eval_run_cases to app_rls;');
    expect(up).toMatch(
      /create policy developer_eval_run_cases_owner[\s\S]*?user_id = \(select public.current_app_user_id\(\)\)[\s\S]*?from public.developer_eval_runs run/,
    );
    expect(up).not.toMatch(/grant[^;]*(update|delete)[^;]*developer_eval_run_cases/);
  });

  it('is the table and column the run service writes and reads', () => {
    expect(service).toContain('insert into public.developer_eval_run_cases');
    expect(service).toContain('from public.developer_eval_run_cases');
    expect(service).toContain('expected_output, passed, grade');
  });

  it('rolls back what it adds and its ledger entry', () => {
    expect(down).toContain('drop table if exists public.developer_eval_run_cases;');
    expect(down).toContain('alter table public.developer_eval_results');
    expect(down).toContain('drop column if exists expected_output;');
    expect(down).toContain("where filename = '0407_developer_eval_run_cases.sql';");
  });
});
