import { describe, expect, it } from 'vitest';

import {
  SecurityScanDecisionRequestSchema,
  SecurityScanReportSchema,
  SecurityScanRequestSchema,
  securityScanFindingPath,
  securityScanSessionPath,
} from '../security-scan';

const SCAN_ID = '22222222-2222-4222-8222-222222222222';

describe('security scan contract', () => {
  it('accepts a scan request only with explicit consent', () => {
    expect(SecurityScanRequestSchema.safeParse({ consent: true, scope: 'src' }).success).toBe(true);
    expect(SecurityScanRequestSchema.safeParse({ consent: false }).success).toBe(false);
    expect(SecurityScanRequestSchema.safeParse({}).success).toBe(false);
    expect(SecurityScanRequestSchema.safeParse({ consent: true, extra: 1 }).success).toBe(false);
  });

  it('accepts only the two decisions on a scan id', () => {
    expect(
      SecurityScanDecisionRequestSchema.safeParse({ scanId: SCAN_ID, decision: 'approve' }).success,
    ).toBe(true);
    expect(
      SecurityScanDecisionRequestSchema.safeParse({ scanId: SCAN_ID, decision: 'apply' }).success,
    ).toBe(false);
    expect(
      SecurityScanDecisionRequestSchema.safeParse({ scanId: 'nope', decision: 'dismiss' }).success,
    ).toBe(false);
  });

  it('reads each report status and refuses an unknown one', () => {
    const running = { status: 'running', scanId: SCAN_ID, startedAt: '2026-10-22T10:00:00Z' };
    expect(SecurityScanReportSchema.safeParse(running).success).toBe(true);
    expect(SecurityScanReportSchema.safeParse({ ...running, status: 'queued' }).success).toBe(
      false,
    );
  });

  it('encodes ids into the endpoint paths', () => {
    expect(securityScanSessionPath('a/b')).toBe('/api/security-scan/sessions/a%2Fb');
    expect(securityScanFindingPath('s', 'f')).toBe('/api/security-scan/sessions/s/findings/f');
  });
});
