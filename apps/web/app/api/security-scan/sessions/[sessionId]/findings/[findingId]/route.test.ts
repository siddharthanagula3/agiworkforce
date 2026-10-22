import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ServiceModule = typeof import('@/features/security-scan/server/service');

const mocks = vi.hoisted(() => ({
  routeContext: vi.fn(),
  decide: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/features/security-scan/server/route-access', () => ({
  securityScanRouteContext: mocks.routeContext,
}));
vi.mock('@/features/security-scan/server/service', async (importOriginal) => {
  const actual = await importOriginal<ServiceModule>();
  return { ...actual, decideSecurityScanFinding: mocks.decide };
});

import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '22222222-2222-4222-8222-222222222222';
const FINDING_ID = '0123456789abcdef';
const scanContext = {
  db: {},
  owner: { userId: 'user-1', organizationId: null },
  sessionId: SESSION_ID,
  planTier: 'pro',
};

function decide(body: unknown, findingId = FINDING_ID) {
  return POST(
    new NextRequest(
      `http://localhost:3000/api/security-scan/sessions/${SESSION_ID}/findings/${findingId}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      },
    ),
    { params: Promise.resolve({ sessionId: SESSION_ID, findingId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.routeContext.mockResolvedValue(scanContext);
  mocks.decide.mockResolvedValue({
    report: { status: 'completed', findings: [] },
    delivery: { status: 'pushed', pullRequestUrl: 'https://github.com/a/b/pull/1', error: null },
  });
});

describe('POST /api/security-scan/sessions/[sessionId]/findings/[findingId]', () => {
  it('passes a valid approval to the service and audits it', async () => {
    const response = await decide({ scanId: SCAN_ID, decision: 'approve' });
    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith(scanContext, {
      scanId: SCAN_ID,
      findingId: FINDING_ID,
      decision: 'approve',
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'security_finding_approved', reason: 'pushed' }),
      }),
    );
  });

  it('refuses an unknown decision or a malformed scan id', async () => {
    expect((await decide({ scanId: SCAN_ID, decision: 'apply' })).status).toBe(400);
    expect((await decide({ scanId: 'nope', decision: 'dismiss' })).status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('answers not found for a finding id that cannot exist', async () => {
    expect((await decide({ scanId: SCAN_ID, decision: 'dismiss' }, 'zz')).status).toBe(404);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
