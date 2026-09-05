import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

interface ZeroDataRetentionPolicyResultLike {
  required: boolean;
  organizationId: string | null;
}

const zdrMocks = vi.hoisted(() => ({
  resolveZeroDataRetentionPolicy: vi.fn(
    async (): Promise<ZeroDataRetentionPolicyResultLike> => ({
      required: false,
      organizationId: null,
    }),
  ),
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveZeroDataRetentionPolicy: zdrMocks.resolveZeroDataRetentionPolicy,
}));

interface ServedRouteAffinityLike {
  routeId: string;
  modelKey?: string;
  taskType?: string;
}

const affinityMocks = vi.hoisted(() => ({
  getServedRouteAffinity: vi.fn(async (): Promise<ServedRouteAffinityLike | null> => null),
}));
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getServedRouteAffinity: affinityMocks.getServedRouteAffinity,
  getRouteHealthSnapshot: vi.fn(async () => ({})),
}));

const modelPolicyMocks = vi.hoisted(() => ({
  readModelPolicy: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('@/lib/services/model-policy-service', () => ({
  readModelPolicy: modelPolicyMocks.readModelPolicy,
}));

import { POST, OPTIONS } from './route';

const PAID_TIER = 'pro';

function authenticated(userId = 'user-preview-1', planTier = PAID_TIER) {
  authGateMocks.runAuthGate.mockResolvedValue({
    ok: true,
    userId,
    token: 'token-preview',
    subscription: { plan_tier: planTier, status: 'active' },
  });
  scopedDbMocks.getUserScopedDb.mockResolvedValue({
    db: scopedDbMocks.db,
    userId,
    organizationId: null,
  });
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/llm/v1/route/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  affinityMocks.getServedRouteAffinity.mockResolvedValue(null);
  zdrMocks.resolveZeroDataRetentionPolicy.mockResolvedValue({
    required: false,
    organizationId: null,
  });
  modelPolicyMocks.readModelPolicy.mockResolvedValue(null);
});

describe('POST /api/llm/v1/route/preview · auth', () => {
  it('returns the auth gate failure response without reading any routing state', async () => {
    authGateMocks.runAuthGate.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: { message: 'Missing or invalid authorization header', code: 'invalid_api_key' } },
        { status: 401 },
      ),
    });

    const response = await POST(request({ taskType: 'general' }));

    expect(response.status).toBe(401);
    expect(scopedDbMocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(zdrMocks.resolveZeroDataRetentionPolicy).not.toHaveBeenCalled();
  });
});

describe('POST /api/llm/v1/route/preview · request validation', () => {
  it('rejects malformed JSON with 400', async () => {
    authenticated();
    const response = await POST(request('not json'));
    expect(response.status).toBe(400);
  });

  it('rejects a missing task type with 400', async () => {
    authenticated();
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });

  it('rejects an unknown task type with 400 and a named code', async () => {
    authenticated();
    const response = await POST(request({ taskType: 'not_a_real_task' }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unknown_task_type' },
    });
  });
});

describe('POST /api/llm/v1/route/preview · shape', () => {
  it('returns a ranked preview with liveRequestExecuted false and the selected candidate admitted', async () => {
    authenticated();
    const response = await POST(request({ taskType: 'general' }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      selected: { status: string; modelKey?: string; routeId?: string };
      candidates: Array<{ modelKey: string; routeId: string; admitted: boolean }>;
      excluded: Array<{ reason: string }>;
      liveRequestExecuted: boolean;
    };

    expect(body.liveRequestExecuted).toBe(false);
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(Array.isArray(body.excluded)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);

    if (body.selected.status === 'selected') {
      const match = body.candidates.find(
        (candidate) =>
          candidate.modelKey === body.selected.modelKey &&
          candidate.routeId === body.selected.routeId,
      );
      expect(match?.admitted).toBe(true);
    }
  });

  it('reads workspace policy, zero-data-retention policy and continuity state before deciding', async () => {
    authenticated();
    affinityMocks.getServedRouteAffinity.mockResolvedValue({
      routeId: 'some/route',
      modelKey: 'workhorse_general',
      taskType: 'coding',
    });

    const response = await POST(request({ taskType: 'coding', conversationId: 'conv-1' }));

    expect(response.status).toBe(200);
    expect(affinityMocks.getServedRouteAffinity).toHaveBeenCalledWith('conv-1');
    expect(zdrMocks.resolveZeroDataRetentionPolicy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/llm/v1/route/preview · never touches a provider', () => {
  it('never imports a provider adapter or dispatch module', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/llm/v1/route/preview/route.ts'),
      'utf8',
    );
    for (const forbidden of [
      'adapter-factory',
      'startProviderStream',
      'ADAPTER_PROVIDERS',
      'drainToLlmResponse',
      'managed-failover',
      'stream-transform',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('OPTIONS /api/llm/v1/route/preview', () => {
  it('answers the CORS preflight with 204', () => {
    const response = OPTIONS(request(''));
    expect(response.status).toBe(204);
  });
});
