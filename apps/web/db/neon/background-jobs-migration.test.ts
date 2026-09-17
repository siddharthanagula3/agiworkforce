import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { JOB_KINDS, JOB_QUEUE_NAMES } from '@/lib/jobs/job-queues';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0208_background_jobs.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0208_background_jobs.down.sql'),
  'utf8',
);

describe('background jobs migration', () => {
  it('accepts every queue and kind the application enqueues', () => {
    const queuePattern = /queue text not null check \(queue ~ '([^']+)'\)/.exec(migration)?.[1];
    const kindPattern = /kind text not null check \(kind ~ '([^']+)'\)/.exec(migration)?.[1];
    expect(queuePattern).toBeDefined();
    expect(kindPattern).toBeDefined();
    for (const queue of JOB_QUEUE_NAMES) {
      expect(new RegExp(queuePattern!).test(queue)).toBe(true);
    }
    for (const kind of Object.keys(JOB_KINDS)) {
      expect(new RegExp(kindPattern!).test(kind)).toBe(true);
    }
  });

  it('gives one job per queue and idempotency key so a producer cannot file the same work twice', () => {
    expect(migration).toContain(
      'create unique index if not exists background_jobs_queue_idempotency_uidx',
    );
    expect(migration).toMatch(
      /on public\.background_jobs \(queue, idempotency_key\)\s+where idempotency_key is not null/,
    );
  });

  it('keys fairness on the workspace, then the account, then the platform', () => {
    expect(migration).toContain(
      "coalesce('org:' || organization_id::text, 'user:' || user_id, 'platform')",
    );
  });

  it('refuses a dead job with no reason and a running job with no lease', () => {
    expect(migration).toContain('constraint background_jobs_dead_has_reason');
    expect(migration).toContain('constraint background_jobs_running_has_lease');
  });

  it('indexes the claim, the running set, the dead letters and each subject', () => {
    for (const index of [
      'idx_background_jobs_claimable',
      'idx_background_jobs_running_lease',
      'idx_background_jobs_dead',
      'idx_background_jobs_user',
      'idx_background_jobs_organization',
    ]) {
      expect(migration).toContain(index);
    }
  });

  it('lets an account read only its own jobs and file one only for itself', () => {
    expect(migration).toContain('alter table public.background_jobs enable row level security');
    expect(migration).toContain('alter table public.background_jobs force row level security');
    expect(migration).toContain('create policy background_jobs_owner_read');
    expect(migration).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(migration).toContain('create policy background_jobs_owner_enqueue');
    expect(migration).toContain('public.app_row_is_writable(user_id, organization_id)');
    expect(migration).not.toMatch(/grant\s+[^;]*update[^;]*on public\.background_jobs to app_rls/);
  });

  it('cascades the subject and the workspace so erasure takes the queue with it', () => {
    expect(migration).toContain('user_id text references public.profiles(id) on delete cascade');
    expect(migration).toContain(
      'organization_id uuid references public.organizations(id) on delete cascade',
    );
  });

  it('is reversible: the reversal names the table, its indexes, constraints, policies and RLS', () => {
    for (const named of [
      'drop table if exists public.background_jobs',
      'background_jobs_queue_idempotency_uidx',
      'idx_background_jobs_claimable',
      'background_jobs_dead_has_reason',
      'background_jobs_owner_read',
      'background_jobs_owner_enqueue',
      'disable row level security',
      'delete from public.schema_migrations',
    ]) {
      expect(reversal).toContain(named);
    }
  });
});
