import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SessionServiceModule = typeof import('@/lib/services/cloud-code-session-service');
type LoggerModule = typeof import('@/lib/logger');
type RuntimeModule = typeof import('@/lib/e2b/runtime');
type SessionStoreModule = typeof import('@/lib/e2b/session-store');

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  readHead: vi.fn(),
  recordHead: vi.fn(),
  getExecutor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<RuntimeModule>()),
  getE2BExecutor: mocks.getExecutor,
}));
vi.mock('@/lib/e2b/session-store', async (importOriginal) => ({
  ...(await importOriginal<SessionStoreModule>()),
  managedCloudCodeSessionScope: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<SessionServiceModule>();
  return {
    ...actual,
    getCloudCodeSession: mocks.getSession,
    claimCloudCodeSessionForRun: mocks.claim,
    releaseCloudCodeSessionAfterRun: mocks.release,
    readCloudCodeSessionScanHead: mocks.readHead,
    recordCloudCodeSessionScanHead: mocks.recordHead,
  };
});

import type { SecurityScanReport } from '@agiworkforce/cloud-contracts';
import { SECURITY_SCAN_REPLAY_MESSAGE, SecurityScanReportReplayError } from '../report-signing';
import { withSecurityScanWorkspace, type SecurityScanWorkspace } from '../workspace';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = { userId: 'user-1', organizationId: null };
const LEASE = 'lease-token';
const REPORT_PATH = '/home/user/.agi-security-scan/report.json';

function report(scanId: string, findingState: 'open' | 'dismissed' = 'open'): SecurityScanReport {
  return {
    status: 'completed',
    scanId,
    startedAt: '2026-10-22T10:00:00.000Z',
    completedAt: '2026-10-22T10:02:00.000Z',
    commit: null,
    model: 'Auto',
    coverage: {
      scope: null,
      candidateFiles: 1,
      scannedFiles: 1,
      scannedBytes: 10,
      skippedFiles: 0,
    },
    dropped: { unanchored: 0, patchRejected: 0, refuted: 0, unparsable: 0 },
    findings: [
      {
        id: '0123456789abcdef',
        path: 'src/a.ts',
        line: 3,
        severity: 'high',
        category: 'sql-injection',
        title: 'SQL injection',
        explanation: 'Interpolated SQL.',
        evidence: 'db.query(x)',
        verification: 'Reachable from the request.',
        patch: 'diff --git a/src/a.ts b/src/a.ts\n',
        state: findingState,
        decidedAt: findingState === 'open' ? null : '2026-10-22T10:05:00.000Z',
      },
    ],
  };
}

const SCAN_A = '22222222-2222-4222-8222-222222222222';
const SCAN_B = '33333333-3333-4333-8333-333333333333';

interface Head {
  scanId: string;
  issuedAt: string;
}

let sandboxFiles: Map<string, string>;
let head: Head | null;

function enter<T>(work: (workspace: SecurityScanWorkspace) => Promise<T>) {
  return withSecurityScanWorkspace({} as never, OWNER, SESSION_ID, 'pro', work);
}

function write(next: SecurityScanReport) {
  vi.setSystemTime(Date.now() + 1000);
  return enter((workspace) => workspace.writeReport(next));
}

beforeEach(() => {
  vi.stubEnv('CSRF_SECRET', 'x'.repeat(48));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'));
  vi.clearAllMocks();
  sandboxFiles = new Map();
  head = null;
  const session = {
    id: SESSION_ID,
    state: 'ready',
    archivedAt: null,
    repositoryUrl: 'https://github.com/acme/app.git',
    workspacePath: '/home/user/repo',
    networkAccess: 'trusted',
    runtimeId: null,
    extraHosts: [],
  };
  mocks.getSession.mockResolvedValue(session);
  mocks.claim.mockResolvedValue({ session, leaseToken: LEASE });
  mocks.release.mockResolvedValue(session);
  mocks.readHead.mockImplementation(async () => head);
  mocks.recordHead.mockImplementation(
    async (_db: unknown, _owner: unknown, _id: string, lease: string, next: Head) => {
      expect(lease).toBe(LEASE);
      head = next;
    },
  );
  mocks.getExecutor.mockResolvedValue({
    runCommand: vi.fn(),
    createFolder: vi.fn(async () => ({ ok: true })),
    writeFile: vi.fn(async ({ path, content }: { path: string; content: string }) => {
      sandboxFiles.set(path, content);
      return { ok: true };
    }),
    readFileBytes: vi.fn(async (path: string) => {
      const content = sandboxFiles.get(path);
      return content === undefined ? null : new TextEncoder().encode(content);
    }),
    pause: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the scan report a session serves', () => {
  it('serves the report that was just written, and records it as the latest under the lease', async () => {
    const written = report(SCAN_A);

    const read = await enter(async (workspace) => {
      await workspace.writeReport(written);
      return workspace.readReport();
    });

    expect(read).toEqual(written);
    expect(mocks.recordHead).toHaveBeenCalledTimes(1);
    expect(head?.scanId).toBe(SCAN_A);
  });

  it('records the head before the file, so a failed head write leaves no report behind', async () => {
    mocks.recordHead.mockRejectedValueOnce(new Error('lease lost'));

    await expect(write(report(SCAN_A))).rejects.toThrow('lease lost');
    expect(sandboxFiles.size).toBe(0);
  });

  it('refuses an older valid report restored over a newer scan', async () => {
    await write(report(SCAN_A));
    const olderFile = sandboxFiles.get(REPORT_PATH)!;
    await write(report(SCAN_B));
    sandboxFiles.set(REPORT_PATH, olderFile);

    const failure = await enter((workspace) => workspace.readReport()).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(SecurityScanReportReplayError);
    expect((failure as SecurityScanReportReplayError).scanId).toBe(SCAN_A);
    expect((failure as Error).message).toBe(SECURITY_SCAN_REPLAY_MESSAGE);
    expect(SECURITY_SCAN_REPLAY_MESSAGE).toContain('Run the scan again');
  });

  it('refuses an earlier state of the same scan, so a decided finding cannot be reopened', async () => {
    await write(report(SCAN_A, 'open'));
    const openFile = sandboxFiles.get(REPORT_PATH)!;
    await write(report(SCAN_A, 'dismissed'));
    sandboxFiles.set(REPORT_PATH, openFile);

    await expect(enter((workspace) => workspace.readReport())).rejects.toBeInstanceOf(
      SecurityScanReportReplayError,
    );
  });

  it('accepts the current report after a later scan replaced the earlier one', async () => {
    await write(report(SCAN_A));
    await write(report(SCAN_B));

    const read = await enter((workspace) => workspace.readReport());

    expect(read).toEqual(report(SCAN_B));
  });

  it('refuses a stored report when the session has no recorded scan, as before this change', async () => {
    await write(report(SCAN_A));
    head = null;

    await expect(enter((workspace) => workspace.readReport())).rejects.toBeInstanceOf(
      SecurityScanReportReplayError,
    );
  });

  it('has no report to serve when nothing was written', async () => {
    expect(await enter((workspace) => workspace.readReport())).toBeNull();
    expect(mocks.readHead).not.toHaveBeenCalled();
  });

  it('treats a report that fails its signature as no report, without asking for the head', async () => {
    sandboxFiles.set(REPORT_PATH, 'not a sealed report');

    expect(await enter((workspace) => workspace.readReport())).toBeNull();
    expect(mocks.readHead).not.toHaveBeenCalled();
  });
});
