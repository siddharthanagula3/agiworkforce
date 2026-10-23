import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  routeContext: vi.fn(),
  runScan: vi.fn(),
  readState: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/features/security-scan/server/route-access', () => ({
  securityScanRouteContext: mocks.routeContext,
}));
vi.mock('@/features/security-scan/server/service', async (importOriginal) => ({
  ...(await importOriginal<ServiceModule>()),
  runSecurityScan: mocks.runScan,
  readSecurityScanState: mocks.readState,
}));

import { GET, POST } from './route';

type LoggerModule = typeof import('@/lib/logger');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type ServiceModule = typeof import('@/features/security-scan/server/service');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ sessionId: SESSION_ID }) };
const scanContext = {
  db: {},
  owner: { userId: 'user-1', organizationId: null },
  sessionId: SESSION_ID,
  planTier: 'pro',
};

function post(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/security-scan/sessions/${SESSION_ID}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.routeContext.mockResolvedValue(scanContext);
  mocks.runScan.mockResolvedValue({ scanId: 'scan-1', findings: [{ id: 'a' }] });
  mocks.readState.mockResolvedValue({ session: { id: SESSION_ID }, report: null });
});

describe('POST /api/security-scan/sessions/[sessionId]', () => {
  it('refuses to scan without explicit consent', async () => {
    for (const body of [{}, { consent: 'yes' }, { consent: false }]) {
      const response = await POST(post(body), params);
      expect(response.status).toBe(400);
    }
    expect(mocks.runScan).not.toHaveBeenCalled();
  });

  it('refuses a scope outside the repository', async () => {
    const response = await POST(post({ consent: true, scope: '../../etc' }), params);
    expect(response.status).toBe(400);
    expect(mocks.runScan).not.toHaveBeenCalled();
  });

  it('runs the scan on consent and audits it', async () => {
    const response = await POST(post({ consent: true, scope: 'src/' }), params);
    expect(response.status).toBe(200);
    expect(mocks.runScan).toHaveBeenCalledWith(scanContext, 'src', {
      model: undefined,
      effort: undefined,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'code_session_lifecycle_changed',
        detail: expect.objectContaining({ status: 'security_scan_completed', count: 1 }),
      }),
    );
  });

  it('passes the chosen model and effort to the scan', async () => {
    const response = await POST(
      post({ consent: true, model: 'some-model', effort: 'high' }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.runScan).toHaveBeenCalledWith(scanContext, null, {
      model: 'some-model',
      effort: 'high',
    });
  });

  it('refuses an effort off the ladder, an empty model and a field it does not know', async () => {
    for (const body of [
      { consent: true, effort: 'extreme' },
      { consent: true, model: '' },
      { consent: true, provider: 'x' },
    ]) {
      const response = await POST(post(body), params);
      expect(response.status).toBe(400);
    }
    expect(mocks.runScan).not.toHaveBeenCalled();
  });

  it('returns the access gate response without scanning', async () => {
    mocks.routeContext.mockResolvedValueOnce(
      Response.json({ error: { message: 'Upgrade' } }, { status: 402 }),
    );
    const response = await POST(post({ consent: true }), params);
    expect(response.status).toBe(402);
    expect(mocks.runScan).not.toHaveBeenCalled();
  });
});

describe('GET /api/security-scan/sessions/[sessionId]', () => {
  it('returns the session scan state', async () => {
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/security-scan/sessions/${SESSION_ID}`),
      params,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: { id: SESSION_ID },
      report: null,
    });
    expect(mocks.routeContext).toHaveBeenCalledWith(expect.anything(), SESSION_ID, {
      mutation: false,
    });
  });
});
