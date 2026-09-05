import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getSecurityHeaders: vi.fn(() => ({})),
  getCorsHeaders: vi.fn(() => ({})),
  withCorsRoute:
    <T extends (...args: never[]) => Promise<Response>>(handler: T) =>
    (...args: Parameters<T>) =>
      handler(...args),
}));

const authGateMocks = vi.hoisted(() => ({ runAuthGate: vi.fn() }));
vi.mock('../../chat/completions/lib/auth-gate', () => ({
  runAuthGate: authGateMocks.runAuthGate,
}));

const scopedDbMocks = vi.hoisted(() => ({
  db: { query: vi.fn(async () => []), execute: vi.fn(async () => 0) },
  getUserScopedDb: vi.fn(),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: scopedDbMocks.getUserScopedDb,
}));

vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveZeroDataRetentionPolicy: vi.fn(async () => ({ required: false, organizationId: null })),
}));

vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getServedRouteAffinity: vi.fn(async () => null),
  getRouteHealthSnapshot: vi.fn(async () => ({})),
}));

vi.mock('@/lib/services/model-policy-service', () => ({
  readModelPolicy: vi.fn(async () => null),
}));

const capabilityMocks = vi.hoisted(() => ({ getUnhonouredCapabilities: vi.fn() }));
vi.mock('@/lib/services/free-lane/capability-health-service', () => ({
  getUnhonouredCapabilities: capabilityMocks.getUnhonouredCapabilities,
}));

import { POST } from './route';

const TOOLS = 'functionCalling';
const TASK_TYPE = 'general';

interface PreviewBody {
  selected: { status: string; routeId?: string };
  candidates: Array<{
    routeId: string;
    score: { capabilityPenalty: number };
    reasons: string[];
  }>;
}

function authenticated(): void {
  authGateMocks.runAuthGate.mockResolvedValue({
    ok: true,
    userId: 'user-capability-preview',
    token: 'token-preview',
    subscription: { plan_tier: 'pro', status: 'active' },
  });
  scopedDbMocks.getUserScopedDb.mockResolvedValue({
    db: scopedDbMocks.db,
    userId: 'user-capability-preview',
    organizationId: null,
  });
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/llm/v1/route/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

function routeIdsOf(body: PreviewBody): string[] {
  return body.candidates.map((entry) => entry.routeId).filter((routeId) => routeId.length > 0);
}

async function previewBody(body: unknown): Promise<PreviewBody> {
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  return (await response.json()) as PreviewBody;
}

beforeEach(() => {
  vi.clearAllMocks();
  capabilityMocks.getUnhonouredCapabilities.mockResolvedValue({});
  authenticated();
});

describe('POST /api/llm/v1/route/preview, observed capability loss', () => {
  it('does not read the capability store for a request that carries no capability', async () => {
    await previewBody({ taskType: TASK_TYPE });
    expect(capabilityMocks.getUnhonouredCapabilities).not.toHaveBeenCalled();
  });

  it('reads the store for exactly the candidate routes it previewed', async () => {
    const body = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    expect(capabilityMocks.getUnhonouredCapabilities).toHaveBeenCalledTimes(1);
    const [routeIds, capabilities] = capabilityMocks.getUnhonouredCapabilities.mock.calls[0] as [
      string[],
      string[],
    ];
    expect(capabilities).toEqual([TOOLS]);
    expect(routeIds.sort()).toEqual(routeIdsOf(body).sort());
  });

  it('reports the penalty and the reason on the route that stopped honouring the capability', async () => {
    const baseline = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const suspectRouteId = routeIdsOf(baseline)[0]!;
    capabilityMocks.getUnhonouredCapabilities.mockResolvedValue({ [suspectRouteId]: [TOOLS] });

    const body = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const suspect = body.candidates.find((entry) => entry.routeId === suspectRouteId);

    expect(suspect?.score.capabilityPenalty).toBeGreaterThan(0);
    expect(suspect?.reasons.some((reason) => reason.includes(TOOLS))).toBe(true);
    for (const candidate of body.candidates) {
      if (candidate.routeId === suspectRouteId) continue;
      expect(candidate.score.capabilityPenalty).toBe(0);
    }
  });

  it('still previews on the declared capabilities when the store read fails', async () => {
    capabilityMocks.getUnhonouredCapabilities.mockRejectedValue(new Error('store is down'));
    const body = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    expect(body.candidates.length).toBeGreaterThan(0);
    for (const candidate of body.candidates) {
      expect(candidate.score.capabilityPenalty).toBe(0);
    }
  });

  it('rejects a capability name the registry does not declare', async () => {
    const response = await POST(
      request({ taskType: TASK_TYPE, capabilitiesInUse: ['not_a_capability'] }),
    );
    expect(response.status).toBe(400);
    expect(capabilityMocks.getUnhonouredCapabilities).not.toHaveBeenCalled();
  });

  it('returns the auth gate failure before reading anything', async () => {
    authGateMocks.runAuthGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: 'invalid_api_key' } }, { status: 401 }),
    });
    const response = await POST(request({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] }));
    expect(response.status).toBe(401);
    expect(capabilityMocks.getUnhonouredCapabilities).not.toHaveBeenCalled();
  });
});
