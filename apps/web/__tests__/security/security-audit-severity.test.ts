
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockExecute = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: mockExecute,
    query: vi.fn().mockResolvedValue([]),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

const MIGRATION_PATH = resolve(__dirname, '../../db/neon/0032_security_severity_superset.sql');

describe('0032_security_severity_superset.sql — SQL shape', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  const ORIGINAL_TAXONOMY = ['info', 'warning', 'error', 'critical'];
  const APP_TAXONOMY = ['low', 'medium', 'high', 'critical'];

  for (const value of [...new Set([...ORIGINAL_TAXONOMY, ...APP_TAXONOMY])]) {
    it(`migration SQL includes '${value}' in the CHECK constraint`, () => {
      expect(sql).toContain(`'${value}'`);
    });
  }

  it('drops the old constraint before re-adding it (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS security_audit_logs_severity_check/i);
    expect(sql).toMatch(/ADD CONSTRAINT security_audit_logs_severity_check/i);
  });

  it('targets the correct table', () => {
    expect(sql).toContain('public.security_audit_logs');
  });
});

import { logSecurityEvent } from '@/lib/security-audit';

describe('logSecurityEvent — all app-taxonomy severities reach db.execute()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(1);
  });

  const APP_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

  for (const severity of APP_SEVERITIES) {
    it(`calls db.execute() (does not silently drop) for severity='${severity}'`, async () => {
      await logSecurityEvent({
        eventType: 'rate_limit_exceeded',
        severity,
        endpoint: '/api/test',
        details: { identifier: 'test-id' },
      });

      expect(mockExecute).toHaveBeenCalledOnce();

      const [_sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params[2]).toBe(severity);
    });
  }

  it('also accepts legacy taxonomy value critical without remapping', async () => {
    await logSecurityEvent({
      eventType: 'invalid_signature',
      severity: 'critical',
      endpoint: '/api/webhooks/stripe',
    });

    expect(mockExecute).toHaveBeenCalledOnce();
    const [_sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('critical');
  });

  it('uses medium as default severity (logRateLimitExceeded path)', async () => {
    await logSecurityEvent({
      eventType: 'rate_limit_exceeded',
      endpoint: '/api/chat',
      details: { identifier: '127.0.0.1' },
    });

    expect(mockExecute).toHaveBeenCalledOnce();
    const [_sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('medium');
  });
});
