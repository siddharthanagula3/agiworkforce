/**
 * security-audit severity taxonomy alignment
 *
 * Regression test for the silent-drop bug:
 *   - DB constraint (0014_security.sql) originally accepted only
 *     {info, warning, error, critical}
 *   - App taxonomy (security-audit.ts) writes {low, medium, high, critical}
 *   - Rows with severity 'low'/'medium'/'high' triggered Postgres error 23514
 *     and were silently dropped by the surrounding try/catch.
 *
 * Fix: 0032_security_severity_superset.sql replaces the constraint with a
 * superset accepting both taxonomies.
 *
 * This test covers two things:
 * 1. SQL shape: the migration SQL contains every value from both taxonomies.
 * 2. Runtime shape: logSecurityEvent calls db.execute() (not throws) for every
 *    severity the app actually uses, including 'low', 'medium', and 'high'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── server-only guard ────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

// ─── logger mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Neon DB mock ─────────────────────────────────────────────────────────────
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

// ─── SQL shape test ───────────────────────────────────────────────────────────
const MIGRATION_PATH = resolve(__dirname, '../../db/neon/0032_security_severity_superset.sql');

describe('0032_security_severity_superset.sql — SQL shape', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  // Both taxonomies must appear in the constraint
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

// ─── Runtime shape test ───────────────────────────────────────────────────────
// Import AFTER mocks are registered so the mocked module is used.
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

      // Before the fix the try/catch swallowed the DB error; execute was still
      // called but Postgres would reject it. The key assertion here is that
      // execute IS called with the severity value — meaning the code does not
      // filter or remap the value before sending it to the DB.
      expect(mockExecute).toHaveBeenCalledOnce();

      const [_sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      // params[2] is the severity argument (0=userId, 1=eventType, 2=severity, ...)
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
    // Mirrors the production call path: logRateLimitExceeded -> logSecurityEvent
    // with no explicit severity override -> default = 'medium'
    await logSecurityEvent({
      eventType: 'rate_limit_exceeded',
      // severity intentionally omitted — should default to 'medium'
      endpoint: '/api/chat',
      details: { identifier: '127.0.0.1' },
    });

    expect(mockExecute).toHaveBeenCalledOnce();
    const [_sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('medium');
  });
});
