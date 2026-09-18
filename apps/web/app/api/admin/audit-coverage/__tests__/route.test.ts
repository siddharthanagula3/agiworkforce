import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  withRateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  resolveAuditCoverageRoot: vi.fn(),
  buildAuditCoverageReport: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));

vi.mock('@/lib/services/audit-coverage', () => ({
  resolveAuditCoverageRoot: (...args: unknown[]) => mocks.resolveAuditCoverageRoot(...args),
  buildAuditCoverageReport: (...args: unknown[]) => mocks.buildAuditCoverageReport(...args),
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const REPORT = {
  generatedAt: '2026-09-18T00:00:00.000Z',
  totals: { mutatingRoutes: 240, audited: 130, unaudited: 110, declaredGaps: 22 },
  unaudited: [
    {
      route: 'memory/route.ts',
      methods: ['POST'],
      emits: [],
      emitters: [],
      reason: 'own_content',
      expectedEvent: null,
    },
  ],
  undeclared: [],
  staleExemptions: [],
  surfaces: [],
};

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/audit-coverage', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
  mocks.resolveAuditCoverageRoot.mockReturnValue('/srv/apps/web');
  mocks.buildAuditCoverageReport.mockReturnValue(REPORT);
});

describe('the audit coverage route', () => {
  it('answers not found to anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.buildAuditCoverageReport).not.toHaveBeenCalled();
  });

  it('never sweeps when the rate limiter already answered', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.buildAuditCoverageReport).not.toHaveBeenCalled();
  });

  it('serves the sweep and its declared exemptions to an operator, uncached', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(REPORT);
    expect(mocks.buildAuditCoverageReport).toHaveBeenCalledWith('/srv/apps/web');
  });

  it('says it cannot answer rather than reporting an empty tree as full coverage', async () => {
    mocks.resolveAuditCoverageRoot.mockReturnValue(null);

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('route_sources_unavailable');
    expect(mocks.buildAuditCoverageReport).not.toHaveBeenCalled();
  });
});
