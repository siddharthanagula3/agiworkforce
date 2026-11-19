import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0417_trial_reminder_settled_for.sql');
const down = read('down/0417_trial_reminder_settled_for.down.sql');
const service = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/trial-reminder-service.ts'),
  'utf8',
);

describe('0417 trial reminder settled for', () => {
  it('adds the nullable subscription id the reminder reads and writes', () => {
    expect(up).toContain('alter table public.subscriptions');
    expect(up).toContain('add column if not exists trial_reminder_settled_for text;');
    expect(up).not.toMatch(/trial_reminder_settled_for text\s+not null/);
    expect(service).toContain('subscription_row.trial_reminder_settled_for');
    expect(service).toContain('set trial_reminder_settled_for = $2');
  });

  it('marks only trialing subscriptions that already have their in-app reminder', () => {
    expect(up).toContain("where subscription_row.status = 'trialing'");
    expect(up).toContain('and subscription_row.trial_reminder_settled_for is null');
    expect(up).toContain(
      "notice.dedupe_key = 'trial-ending:' || subscription_row.stripe_subscription_id",
    );
    expect(service).toContain("const TRIAL_ENDING_NOTICE = 'trial-ending:';");
  });

  it('keeps the migration in one transaction and adds no policy or grant', () => {
    expect(up).toMatch(/^begin;$/m);
    expect(up).toMatch(/^commit;$/m);
    expect(up).not.toMatch(/^\s*(grant|create policy)\b/im);
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop column if exists trial_reminder_settled_for;');
    expect(down).toContain("where filename = '0417_trial_reminder_settled_for.sql';");
    expect(down).toContain('WHAT THIS COSTS');
  });
});
