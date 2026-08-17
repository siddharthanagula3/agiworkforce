import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockExecute = vi.fn().mockResolvedValue(1);
const mockQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: mockExecute,
    query: mockQuery,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

import {
  SECURITY_AUDIT_LOG_RETENTION_DAYS,
  SECURITY_LOG_RETENTION_CRON_PATH,
  purgeExpiredSecurityAuditLogs,
} from '@/lib/server/security-log-retention';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

function auditInsertCall(): unknown[] | undefined {
  return mockExecute.mock.calls.find((call) =>
    String(call[0]).toLowerCase().includes('insert into security_audit_logs'),
  );
}

describe('security audit log retention runs on a schedule, not by hand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(1);
  });

  it('is scheduled daily in vercel.json against a route that exists', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const cron = config.crons?.find((entry) => entry.path === SECURITY_LOG_RETENTION_CRON_PATH);

    expect(
      cron,
      'the 90-day security audit log purge must be a schedule, not an administrator routine',
    ).toBeDefined();
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);

    const routeFile = join(
      process.cwd(),
      'app',
      'api',
      'cron',
      SECURITY_LOG_RETENTION_CRON_PATH.replace('/api/cron/', ''),
      'route.ts',
    );
    expect(existsSync(routeFile), `${routeFile} must exist`).toBe(true);
  });

  it('purges through the retention function and reports what it deleted', async () => {
    mockQuery.mockResolvedValueOnce([{ deleted: 42 }]).mockResolvedValueOnce([{ age_days: 12.5 }]);

    const run = await purgeExpiredSecurityAuditLogs('cron');

    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('cleanup_old_security_logs()');
    expect(run).toEqual({
      retentionDays: SECURITY_AUDIT_LOG_RETENTION_DAYS,
      deleted: 42,
      oldestRemainingAgeDays: 12.5,
      retentionHolds: true,
    });
  });

  it('appends an audit event so the retention actually applied is provable', async () => {
    mockQuery.mockResolvedValueOnce([{ deleted: 7 }]).mockResolvedValueOnce([{ age_days: 89 }]);

    await purgeExpiredSecurityAuditLogs('cron');

    const insert = auditInsertCall();
    expect(insert, 'each retention run must leave an append-only record').toBeDefined();

    const params = insert?.[1] as unknown[];
    expect(params[1]).toBe('retention_purge');
    expect(params[2]).toBe('low');
    expect(JSON.parse(String(params[6]))).toMatchObject({
      table: 'security_audit_logs',
      retentionDays: SECURITY_AUDIT_LOG_RETENTION_DAYS,
      deleted: 7,
      retentionHolds: true,
    });
  });

  it('records which trigger ran the purge', async () => {
    mockQuery.mockResolvedValueOnce([{ deleted: 1 }]).mockResolvedValueOnce([{ age_days: 3 }]);

    await purgeExpiredSecurityAuditLogs('admin');

    const params = auditInsertCall()?.[1] as unknown[];
    expect(JSON.parse(String(params[6]))).toMatchObject({ trigger: 'admin' });
  });

  it('declares the same window the SQL function actually deletes by', () => {
    const migrations = join(process.cwd(), 'db', 'neon');
    const defining = readdirSync(migrations)
      .filter(
        (file) =>
          file.endsWith('.sql') &&
          readFileSync(join(migrations, file), 'utf8').includes(
            'create or replace function public.cleanup_old_security_logs',
          ),
      )
      .sort();

    expect(defining.length).toBeGreaterThan(0);

    const latest = readFileSync(join(migrations, defining[defining.length - 1] as string), 'utf8');
    const body = latest.slice(
      latest.indexOf('create or replace function public.cleanup_old_security_logs'),
    );
    const window = /interval\s+'(\d+)\s+days'/.exec(body);

    expect(window?.[1], 'the purge must delete by an explicit day window').toBeDefined();
    expect(Number(window?.[1])).toBe(SECURITY_AUDIT_LOG_RETENTION_DAYS);
  });

  it('raises severity when rows survive past the retention window', async () => {
    mockQuery
      .mockResolvedValueOnce([{ deleted: 0 }])
      .mockResolvedValueOnce([{ age_days: SECURITY_AUDIT_LOG_RETENTION_DAYS + 5 }]);

    const run = await purgeExpiredSecurityAuditLogs('cron');

    expect(run.retentionHolds).toBe(false);

    const params = auditInsertCall()?.[1] as unknown[];
    expect(params[2]).toBe('high');
  });

  it('leaves no purge path that deletes audit rows without recording it', () => {
    const callers: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') {
          continue;
        }
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (
          /\.tsx?$/.test(entry) &&
          readFileSync(full, 'utf8').includes('cleanup_old_security_logs(')
        ) {
          callers.push(relative(process.cwd(), full));
        }
      }
    }

    walk(join(process.cwd(), 'lib'));
    walk(join(process.cwd(), 'app'));

    expect(callers).toEqual(['lib/server/security-log-retention.ts']);
  });

  it('reports an empty table as retention holding', async () => {
    mockQuery.mockResolvedValueOnce([{ deleted: 3 }]).mockResolvedValueOnce([{ age_days: null }]);

    const run = await purgeExpiredSecurityAuditLogs('cron');

    expect(run.oldestRemainingAgeDays).toBeNull();
    expect(run.retentionHolds).toBe(true);
  });
});
