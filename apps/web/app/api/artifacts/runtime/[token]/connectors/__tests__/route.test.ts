import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/csrf');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/api-auth');
type ScanModule3 = typeof import('@/lib/server/rls-db');
type ScanModule4 = typeof import('@/lib/services/artifact-runtime-service');

const mocks = vi.hoisted(() => ({
  readRunnableArtifact: vi.fn(),
  describeArtifactConnectors: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  gate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/services/artifact-runtime-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  readRunnableArtifact: mocks.readRunnableArtifact,
  describeArtifactConnectors: mocks.describeArtifactConnectors,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  ensureSeatMemberCreditAccount: vi.fn(),
  isSeatBearingBillingPlan: vi.fn(),
  resolveEffectiveSubscription: vi.fn(),
  resolveEntitledPlanTier: vi.fn(),
  resolveEntitlementBundle: mocks.resolveEntitlementBundle,
}));
vi.mock('@/lib/services/artifact-connector-gate', () => ({
  artifactConnectorsGateResponse: mocks.gate,
}));

import { POST } from '../route';

const TOKEN = 'a'.repeat(24);

function call(body: unknown, token = TOKEN) {
  const request = new NextRequest(`https://app.test/api/artifacts/runtime/${token}/connectors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ token }) });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as { error?: { code?: string } };
  return payload.error?.code;
}

describe('POST /api/artifacts/runtime/[token]/connectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRunnableArtifact.mockResolvedValue({ id: 'artifact-1' });
    mocks.resolveEntitlementBundle.mockResolvedValue({ plan: 'pro' });
    mocks.gate.mockResolvedValue(null);
    mocks.describeArtifactConnectors.mockResolvedValue([{ id: 'github', ready: true }]);
  });

  it('refuses a malformed token before touching the database', async () => {
    const response = await call({ connectors: ['github'] }, 'short');
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
    expect(mocks.readRunnableArtifact).not.toHaveBeenCalled();
  });

  it('refuses an empty connector list', async () => {
    const response = await call({ connectors: [] });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_connectors');
  });

  it('refuses an app that is no longer published', async () => {
    mocks.readRunnableArtifact.mockResolvedValue(null);
    const response = await call({ connectors: ['github'] });
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
  });

  it('returns the plan gate refusal unchanged', async () => {
    mocks.gate.mockResolvedValue(
      NextResponse.json({ error: { code: 'plan_upgrade_required' } }, { status: 403 }),
    );
    const response = await call({ connectors: ['github'] });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('plan_upgrade_required');
    expect(mocks.describeArtifactConnectors).not.toHaveBeenCalled();
  });

  it('refuses when the plan cannot describe connectors', async () => {
    mocks.describeArtifactConnectors.mockResolvedValue(null);
    const response = await call({ connectors: ['github'] });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('connectors_unavailable');
  });

  it('describes each named connector once, without caching', async () => {
    const response = await call({ connectors: ['github', 'github'] });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      connectors: [{ id: 'github', ready: true }],
    });
    expect(mocks.describeArtifactConnectors).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', planTier: 'pro', connectors: ['github'] }),
    );
  });
});
