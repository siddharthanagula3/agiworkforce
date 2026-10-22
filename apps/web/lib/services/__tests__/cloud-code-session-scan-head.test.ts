import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type RuntimeModule = typeof import('@/lib/e2b/runtime');
type EgressModule = typeof import('@/lib/e2b/egress-host-resolution');
type SessionStoreModule = typeof import('@/lib/e2b/session-store');
type ConnectorToolsModule = typeof import('@/lib/user-connector-tools');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<RuntimeModule>()),
  getE2BExecutor: vi.fn(),
  killE2BSession: vi.fn(),
}));
vi.mock('@/lib/e2b/egress-host-resolution', async (importOriginal) => ({
  ...(await importOriginal<EgressModule>()),
  assertExtraEgressHostsResolveSafely: vi.fn(async () => undefined),
}));
vi.mock('@/lib/e2b/session-store', async (importOriginal) => ({
  ...(await importOriginal<SessionStoreModule>()),
  managedCloudCodeSessionScope: vi.fn(() => ({})),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ConnectorToolsModule>()),
  getUserGithubInstallations: vi.fn(async () => []),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  readCloudCodeSessionScanHead,
  recordCloudCodeSessionScanHead,
} from '@/lib/services/cloud-code-session-service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = { userId: 'user-1', organizationId: 'org-1' };
const SCAN_ID = '22222222-2222-4222-8222-222222222222';
const ISSUED_AT = '2026-10-22T10:00:00.000Z';

function dbReturning(rows: unknown[]) {
  const query = vi.fn(async () => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readCloudCodeSessionScanHead', () => {
  it('returns the scan id and issue time the server recorded', async () => {
    const { db, query } = dbReturning([
      { security_scan_id: SCAN_ID, security_scan_issued_at: new Date(ISSUED_AT) },
    ]);

    expect(await readCloudCodeSessionScanHead(db, OWNER, SESSION_ID)).toEqual({
      scanId: SCAN_ID,
      issuedAt: ISSUED_AT,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), [
      SESSION_ID,
      'user-1',
      'org-1',
    ]);
  });

  it('returns null for a session that never recorded a scan', async () => {
    const { db } = dbReturning([{ security_scan_id: null, security_scan_issued_at: null }]);

    expect(await readCloudCodeSessionScanHead(db, OWNER, SESSION_ID)).toBeNull();
  });

  it('does not answer for a session the owner does not hold', async () => {
    const { db } = dbReturning([]);

    await expect(readCloudCodeSessionScanHead(db, OWNER, SESSION_ID)).rejects.toBeInstanceOf(
      CloudCodeNotFoundError,
    );
  });
});

describe('recordCloudCodeSessionScanHead', () => {
  it('writes the head only for the run that holds the lease on an owned session', async () => {
    const { db, query } = dbReturning([{ id: SESSION_ID }]);

    await recordCloudCodeSessionScanHead(db, OWNER, SESSION_ID, 'lease-1', {
      scanId: SCAN_ID,
      issuedAt: ISSUED_AT,
    });

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('security_scan_id = $2');
    expect(sql).toContain('security_scan_issued_at = $3');
    expect(sql).toContain("state = 'running'");
    expect(sql).toContain('run_lease_token = $4');
    expect(sql).toContain('user_id = $5');
    expect(params).toEqual([SESSION_ID, SCAN_ID, ISSUED_AT, 'lease-1', 'user-1', 'org-1']);
  });

  it('refuses when the lease was lost, so a reclaimed run cannot move the head', async () => {
    const { db } = dbReturning([]);

    await expect(
      recordCloudCodeSessionScanHead(db, OWNER, SESSION_ID, 'stale-lease', {
        scanId: SCAN_ID,
        issuedAt: ISSUED_AT,
      }),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });
});
