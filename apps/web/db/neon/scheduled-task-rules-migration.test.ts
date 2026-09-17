import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0209_scheduled_task_rules_and_policies.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0209_scheduled_task_rules_and_policies.down.sql'),
  'utf8',
);
const original = fs.readFileSync(path.resolve(import.meta.dirname, '0009_scheduling.sql'), 'utf8');

describe('scheduled task rules and policies migration', () => {
  it('keeps the three schedule types 0009 defined and adds the two new ones', () => {
    expect(original).toContain("check (schedule_type = any (array['cron', 'once', 'interval']))");
    expect(migration).toContain(
      "check (schedule_type = any (array['cron', 'once', 'interval', 'rrule', 'event']))",
    );
  });

  it('adds every column the scheduler reads, and nothing it does not', () => {
    for (const column of [
      'recurrence_rule',
      'dayparts',
      'retry_max_attempts',
      'retry_backoff_seconds',
      'retry_attempt',
      'retry_scheduled_for',
      'missed_execution_policy',
      'condition',
      'condition_state',
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
  });

  it('leaves existing schedules behaving exactly as they did', () => {
    expect(migration).toContain('retry_max_attempts smallint not null default 0');
    expect(migration).toContain("missed_execution_policy text not null default 'run_once'");
  });

  it('refuses a rule on a task that is not rule-driven, and a rule-driven task with none', () => {
    expect(migration).toContain('constraint scheduled_tasks_recurrence_rule_shape');
    expect(migration).toContain("(schedule_type = 'rrule' and recurrence_rule is not null");
    expect(migration).toContain("or (schedule_type <> 'rrule' and recurrence_rule is null)");
  });

  it('bounds the retry policy and the missed-run policy in the database', () => {
    expect(migration).toContain('retry_max_attempts between 0 and 5');
    expect(migration).toContain('retry_backoff_seconds between 60 and 86400');
    expect(migration).toContain('retry_attempt between 0 and retry_max_attempts');
    expect(migration).toContain(
      "check (missed_execution_policy = any (array['run_once', 'skip']))",
    );
  });

  it('bounds the shapes the watch and the dayparts may take', () => {
    expect(migration).toContain("jsonb_typeof(dayparts) = 'array'");
    expect(migration).toContain('jsonb_array_length(dayparts) between 1 and 7');
    expect(migration).toContain("jsonb_typeof(condition) = 'object'");
  });

  it('is reversible, and says what a reversal costs the tasks that used the new types', () => {
    expect(reversal).toContain(
      "delete from public.scheduled_tasks where schedule_type = any (array['rrule', 'event'])",
    );
    for (const column of [
      'drop column if exists recurrence_rule',
      'drop column if exists dayparts',
      'drop column if exists retry_max_attempts',
      'drop column if exists missed_execution_policy',
      'drop column if exists condition',
    ]) {
      expect(reversal).toContain(column);
    }
    expect(reversal).toContain('scheduled_tasks_recurrence_rule_shape');
    expect(reversal).toContain("check (schedule_type = any (array['cron', 'once', 'interval']))");
    expect(reversal).toContain('delete from public.schema_migrations');
  });
});
