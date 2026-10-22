import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SecurityScanReport } from '../../contract';
import {
  SecurityScanSigningUnavailableError,
  openSecurityScanReport,
  sealSecurityScanReport,
} from '../report-signing';

const BINDING = { userId: 'user-1', sessionId: '11111111-1111-4111-8111-111111111111' };
const REPORT: SecurityScanReport = {
  status: 'completed',
  scanId: '22222222-2222-4222-8222-222222222222',
  startedAt: '2026-10-22T10:00:00.000Z',
  completedAt: '2026-10-22T10:02:00.000Z',
  commit: null,
  model: 'Auto',
  coverage: { scope: null, candidateFiles: 3, scannedFiles: 3, scannedBytes: 900, skippedFiles: 0 },
  dropped: { unanchored: 1, patchRejected: 0, refuted: 2, unparsable: 0 },
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
      state: 'open',
      decidedAt: null,
    },
  ],
};

describe('security scan report signing', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', 'x'.repeat(48));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens what it sealed for the same user and session', () => {
    expect(openSecurityScanReport(BINDING, sealSecurityScanReport(BINDING, REPORT))).toEqual(
      REPORT,
    );
  });

  it('refuses a report written for another user or session', () => {
    const sealed = sealSecurityScanReport(BINDING, REPORT);
    expect(openSecurityScanReport({ ...BINDING, userId: 'user-2' }, sealed)).toBeNull();
    expect(
      openSecurityScanReport(
        { ...BINDING, sessionId: '33333333-3333-4333-8333-333333333333' },
        sealed,
      ),
    ).toBeNull();
  });

  it('refuses a report whose patch was changed inside the sandbox', () => {
    const envelope = JSON.parse(sealSecurityScanReport(BINDING, REPORT)) as {
      payload: string;
    };
    const tampered = JSON.stringify({
      ...envelope,
      payload: envelope.payload.replace('diff --git', 'diff  --git'),
    });
    expect(openSecurityScanReport(BINDING, tampered)).toBeNull();
    expect(openSecurityScanReport(BINDING, 'not json')).toBeNull();
  });

  it('fails closed without a signing secret', () => {
    vi.stubEnv('CSRF_SECRET', '');
    expect(() => sealSecurityScanReport(BINDING, REPORT)).toThrow(
      SecurityScanSigningUnavailableError,
    );
  });
});
