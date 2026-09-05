import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  requirePlatformAdmin: vi.fn(async () => ({ userId: 'admin_1' })),
  logSecurityEvent: vi.fn(async (_event: { details: Record<string, unknown> }) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: Parameters<typeof mocks.requirePlatformAdmin>) =>
    mocks.requirePlatformAdmin(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  getClientIp: () => '203.0.113.10',
  logSecurityEvent: (...args: Parameters<typeof mocks.logSecurityEvent>) =>
    mocks.logSecurityEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));

import { ANONYMOUS_SUBJECT_TABLES, eraseAnonymousSubjectByEmail } from './anonymous-erasure';
import { hashConsentSubjectEmail } from './consent-records';
import { createError } from '@/lib/errors';
import { USER_SCOPED_TABLES } from './account-erasure';
import { POST as eraseAnonymousSubject } from '@/app/api/admin/privacy/erasures/route';

const SUBJECT_EMAIL = 'Visitor@Example.com';
const NORMALIZED_EMAIL = 'visitor@example.com';

interface Statement {
  sql: string;
  params: unknown[];
}

function captureStatements(): Statement[] {
  const statements: Statement[] = [];
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (/^\s*select count/iu.test(sql)) return [{ retained: 0 }];
    return [{ id: 'row-1' }];
  });
  return statements;
}

function deleteStatements(statements: Statement[]): Statement[] {
  return statements.filter((statement) => /^\s*delete/iu.test(statement.sql));
}

describe('anonymous subject erasure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'admin_1' });
  });

  it('covers every table that holds an anonymous subject with no user id', () => {
    const covered = new Set(ANONYMOUS_SUBJECT_TABLES.map((entry) => entry.table));
    for (const table of ['cloud_managed_waitlist', 'consent_records', 'data_rights_requests']) {
      expect(covered.has(table)).toBe(true);
      expect(USER_SCOPED_TABLES.some((entry) => entry.table === table)).toBe(true);
    }
  });

  it('deletes only NULL user_id rows and keys each table by the column it actually stores', async () => {
    const statements = captureStatements();

    const report = await eraseAnonymousSubjectByEmail(SUBJECT_EMAIL);

    const deletes = deleteStatements(statements);
    expect(deletes).toHaveLength(3);
    for (const statement of deletes) {
      expect(statement.sql).toMatch(/user_id is null/u);
    }

    const waitlist = deletes.find((statement) => statement.sql.includes('cloud_managed_waitlist'));
    const consent = deletes.find((statement) => statement.sql.includes('consent_records'));
    const rights = deletes.find((statement) => statement.sql.includes('data_rights_requests'));

    expect(waitlist?.sql).toMatch(/lower\(email\)/u);
    expect(waitlist?.params).toEqual([[NORMALIZED_EMAIL]]);
    expect(consent?.sql).toMatch(/lower\(subject_email_sha256\)/u);
    expect(consent?.params).toEqual([[hashConsentSubjectEmail(SUBJECT_EMAIL)]]);
    expect(rights?.sql).toMatch(/lower\(contact_email\)/u);
    expect(rights?.params).toEqual([[NORMALIZED_EMAIL]]);

    expect(report.deleted).toBe(3);
    expect(report.complete).toBe(true);
  });

  it('reports account-bound rows instead of silently leaving them unexplained', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/^\s*select count/iu.test(sql)) return [{ retained: 2 }];
      return [];
    });

    const report = await eraseAnonymousSubjectByEmail(SUBJECT_EMAIL);

    expect(report.deleted).toBe(0);
    expect(report.accountBound).toBe(6);
  });

  it('records a table error rather than claiming a complete erasure', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/^\s*select count/iu.test(sql)) return [{ retained: 0 }];
      if (sql.includes('consent_records')) throw new Error('trigger refused the delete');
      return [{ id: 'row-1' }];
    });

    const report = await eraseAnonymousSubjectByEmail(SUBJECT_EMAIL);

    expect(report.complete).toBe(false);
    expect(report.tables['consent_records']?.error).toContain('trigger refused the delete');
  });

  it('skips a table the database has not migrated yet', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('cloud_managed_waitlist')) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      if (/^\s*select count/iu.test(sql)) return [{ retained: 0 }];
      return [{ id: 'row-1' }];
    });

    const report = await eraseAnonymousSubjectByEmail(SUBJECT_EMAIL);

    expect(report.tables['cloud_managed_waitlist']).toEqual({
      deleted: 0,
      accountBound: 0,
      skipped: true,
    });
    expect(report.complete).toBe(true);
  });
});

describe('POST /api/admin/privacy/erasures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'admin_1' });
  });

  function erasureRequest(body: unknown): NextRequest {
    return new NextRequest('https://app.test/api/admin/privacy/erasures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('erases an anonymous subject end to end and audits the action without the plaintext email', async () => {
    const statements = captureStatements();

    const response = await eraseAnonymousSubject(
      erasureRequest({ email: SUBJECT_EMAIL, reason: 'DPDP-ABCDE erasure request' }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { deleted: number; complete: boolean };
    expect(payload.complete).toBe(true);
    expect(payload.deleted).toBe(3);
    expect(deleteStatements(statements)).toHaveLength(3);

    expect(mocks.logSecurityEvent).toHaveBeenCalledTimes(1);
    const audited = mocks.logSecurityEvent.mock.calls[0]![0];
    expect(audited.details['action']).toBe('anonymous_subject_erasure');
    expect(audited.details['subjectEmailSha256']).toBe(hashConsentSubjectEmail(SUBJECT_EMAIL));
    expect(JSON.stringify(audited)).not.toContain(NORMALIZED_EMAIL);
  });

  it('refuses a caller who is not a platform operator before touching any row', async () => {
    const statements = captureStatements();
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await eraseAnonymousSubject(
      erasureRequest({ email: SUBJECT_EMAIL, reason: 'no' }),
    );

    expect(response.status).toBe(404);
    expect(deleteStatements(statements)).toHaveLength(0);
  });

  it('rejects a payload with no email', async () => {
    const statements = captureStatements();

    const response = await eraseAnonymousSubject(erasureRequest({ reason: 'missing email' }));

    expect(response.status).toBe(400);
    expect(deleteStatements(statements)).toHaveLength(0);
  });
});
