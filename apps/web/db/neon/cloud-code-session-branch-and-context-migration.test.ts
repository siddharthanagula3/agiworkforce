import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0176_cloud_code_session_branch_and_context.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0176_cloud_code_session_branch_and_context.down.sql'),
  'utf8',
);
const sessions = fs.readFileSync(
  path.resolve(import.meta.dirname, '0075_cloud_code_sessions.sql'),
  'utf8',
);

describe('0176 cloud code session branch and context migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds every column additively so an existing session keeps working', () => {
    for (const column of [
      'add column if not exists working_branch text',
      'add column if not exists pull_request_url text',
      'add column if not exists pull_request_number integer',
      'add column if not exists archived_at timestamptz',
      'add column if not exists context_input_tokens bigint not null default 0',
      'add column if not exists context_output_tokens bigint not null default 0',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('constrains the working branch to a ref git cannot read as an option', () => {
    expect(migration).toContain("working_branch ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'");
  });

  it('refuses a pull request url without its number and the other way round', () => {
    expect(migration).toContain('cloud_code_sessions_pull_request_paired');
    expect(migration).toContain('(pull_request_url is null and pull_request_number is null)');
    expect(migration).toContain(
      "pull_request_url ~ '^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$'",
    );
  });

  it('keeps every token count non-negative on both tables', () => {
    expect(migration).toContain('check (context_input_tokens >= 0 and context_output_tokens >= 0)');
    expect(migration).toContain('check (input_tokens >= 0 and output_tokens >= 0)');
  });

  it('records a cancellation request on the turn, not in the running process', () => {
    expect(migration).toContain('add column if not exists cancel_requested_at timestamptz');
  });

  it('leaves the session state enum alone so archiving stays orthogonal to closing', () => {
    expect(sessions).toContain("state in ('provisioning', 'ready', 'running', 'failed', 'closed')");
    expect(migration).not.toContain("'archived'");
    expect(migration).not.toMatch(/state\s+in\s+\(/);
    expect(migration).toContain('add column if not exists archived_at timestamptz');
  });

  it('reverses every column and constraint it adds and retracts its ledger row', () => {
    for (const column of [
      'working_branch',
      'pull_request_url',
      'pull_request_number',
      'archived_at',
      'context_input_tokens',
      'context_output_tokens',
      'cancel_requested_at',
      'input_tokens',
      'output_tokens',
    ]) {
      expect(reversal).toContain(`drop column if exists ${column}`);
    }
    for (const constraint of [
      'cloud_code_sessions_working_branch_ref',
      'cloud_code_sessions_pull_request_paired',
      'cloud_code_sessions_context_tokens_non_negative',
      'cloud_code_agent_turns_tokens_non_negative',
    ]) {
      expect(reversal).toContain(`drop constraint if exists ${constraint}`);
    }
    expect(reversal).toContain(
      "delete from public.schema_migrations\n where filename = '0176_cloud_code_session_branch_and_context.sql'",
    );
    expect(reversal.trim().startsWith('begin;') || reversal.includes('\nbegin;')).toBe(true);
    expect(reversal.trim().endsWith('commit;')).toBe(true);
  });
});
