import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PUBLISHED_RETENTION_CRON_TIMES } from '@/lib/legal/published-cron-schedules';
import { SECURITY_LOG_RETENTION_CRON_PATH } from '@/lib/server/security-log-retention';

const page = readFileSync(join(process.cwd(), 'app/privacy/page.tsx'), 'utf8');
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8')) as {
  crons?: Array<{ path: string; schedule: string }>;
};

const TYPED_CLOCK_TIME = /\b\d{1,2}:\d{2}\b(?:\s*(?:UTC|GMT))?/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function registeredClock(cronPath: string): string {
  const job = (vercel.crons ?? []).find((cron) => cron.path === cronPath);
  if (!job) throw new Error(`${cronPath} is not registered in vercel.json`);
  const [minute, hour] = job.schedule.split(' ');
  return `${hour!.padStart(2, '0')}:${minute!.padStart(2, '0')} UTC`;
}

describe('/privacy takes cron clock times from the registered schedule', () => {
  it('types no clock time into the policy', () => {
    expect(
      page.match(TYPED_CLOCK_TIME) ?? [],
      'a clock time typed into /privacy goes stale when vercel.json moves the job; read it from PUBLISHED_RETENTION_CRON_TIMES',
    ).toEqual([]);
  });

  it('prints the audit-log purge time that vercel.json registers', () => {
    expect(PUBLISHED_RETENTION_CRON_TIMES.securityAuditLogs).toBe(
      registeredClock(SECURITY_LOG_RETENTION_CRON_PATH),
    );
    expect(page.replace(/\s+/gu, ' ')).toMatch(
      new RegExp(
        `<code>${escapeRegExp(SECURITY_LOG_RETENTION_CRON_PATH)}</code> at(?:\\{' '\\})? ?\\{PUBLISHED_RETENTION_CRON_TIMES\\.securityAuditLogs\\}`,
        'u',
      ),
    );
  });
});
