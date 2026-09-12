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
  getCredentialCooldownSnapshot: vi.fn(async () => ({})),
  providerOfRouteId: (routeId: string) => routeId.split('/')[0],
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

import { getRoutePricingForModel } from '@agiworkforce/model-registry';
import { POST } from './route';

const TOOLS = 'functionCalling';
const TASK_TYPE = 'general';

interface PreviewBody {
  selected: { status: string; routeId?: string };
  candidates: Array<{
    routeId: string;
    modelKey: string;
    score: { capabilityPenalty: number };
    reasons: string[];
  }>;
}

/**
 * Every route the catalogue lists for a model, so a capability loss can be
 * declared for the model as a whole. The preview names one route per model, the
 * best-ranked one, and the penalty reorders that ranking: report the loss on a
 * single route and the model simply moves to a sibling transport, leaving no
 * penalised candidate to inspect.
 */
function routeIdsForModel(modelKey: string): string[] {
  return getRoutePricingForModel(modelKey).map((route) => route.routeId);
}

function unhonouredOnEveryRoute(modelKey: string): Record<string, [typeof TOOLS]> {
  return Object.fromEntries(routeIdsForModel(modelKey).map((routeId) => [routeId, [TOOLS]]));
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

  it('reports the penalty and the reason when the model has no route left that honours the capability', async () => {
    const baseline = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const suspectModelKey = baseline.candidates[0]!.modelKey;
    capabilityMocks.getUnhonouredCapabilities.mockResolvedValue(
      unhonouredOnEveryRoute(suspectModelKey),
    );

    const body = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const suspect = body.candidates.find((entry) => entry.modelKey === suspectModelKey);

    expect(suspect?.score.capabilityPenalty).toBeGreaterThan(0);
    expect(suspect?.reasons.some((reason) => reason.includes(TOOLS))).toBe(true);
    for (const candidate of body.candidates) {
      if (candidate.modelKey === suspectModelKey) continue;
      expect(candidate.score.capabilityPenalty).toBe(0);
    }
  });

  it('moves the model to a sibling route when only one of its routes stopped honouring the capability', async () => {
    const baseline = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const suspect = baseline.candidates[0]!;
    const siblings = routeIdsForModel(suspect.modelKey).filter(
      (routeId) => routeId !== suspect.routeId,
    );
    expect(
      siblings.length,
      'the previewed model must carry a second route for the move to be testable',
    ).toBeGreaterThan(0);

    capabilityMocks.getUnhonouredCapabilities.mockResolvedValue({ [suspect.routeId]: [TOOLS] });

    const body = await previewBody({ taskType: TASK_TYPE, capabilitiesInUse: [TOOLS] });
    const moved = body.candidates.find((entry) => entry.modelKey === suspect.modelKey);

    expect(moved?.routeId).not.toBe(suspect.routeId);
    expect(moved?.score.capabilityPenalty).toBe(0);
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
