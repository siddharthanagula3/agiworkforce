import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: mocks.execute, query: mocks.query }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.info, warn: mocks.warn, error: mocks.error, debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { GET } from './route';
import {
  ANTHROPIC_ADMIN_KEY_ENV,
  ANTHROPIC_COST_SOURCE,
  OPENAI_ADMIN_KEY_ENV,
  OPENAI_COST_SOURCE,
  OPENROUTER_COST_SOURCE,
  OPENROUTER_KEY_ENV,
  UNREPORTED_PROVIDERS,
  yesterdayWindow,
} from './lib/provider-cost-reports';

const OPENAI_KEY = 'sk-admin-openai';
const ANTHROPIC_KEY = 'sk-ant-admin';
const OPENROUTER_KEY = 'sk-or-key';

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/cron/reconcile-provider-costs');
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function routeFetch(byHost: Record<string, unknown>) {
  return vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url.toString();
    for (const [fragment, body] of Object.entries(byHost)) {
      if (href.includes(fragment)) return jsonResponse(body);
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  });
}

interface LedgerFixture {
  costs?: Array<Record<string, unknown>>;
  delivered?: Array<Record<string, unknown>>;
  fail?: string;
}

function stubLedger(fixture: LedgerFixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (fixture.fail !== undefined) throw new Error(fixture.fail);
    if (sql.includes('provider_cost_events')) return fixture.costs ?? [];
    if (sql.includes('managed_usage_requests')) return fixture.delivered ?? [];
    return [];
  });
}

function settledCost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source_ref: 'managed_usage:user_1:key_1:hash_1',
    user_id: 'user_1',
    provider: 'openai',
    provider_cost_cents: 10,
    billed_cents: 25,
    customer_canonical_microusd: 250_000,
    created_at: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

function deliveredUsage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: 'user_1',
    idempotency_key: 'key_1',
    request_hash: 'hash_1',
    provider: 'openai',
    actual_cost_cents: 25,
    finalized_at: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.execute.mockResolvedValue(1);
  stubLedger();
});

describe('yesterdayWindow', () => {
  it('spans the whole previous UTC day', () => {
    const window = yesterdayWindow(new Date('2026-09-10T04:15:00.000Z'));

    expect(window.day).toBe('2026-09-09');
    expect(window.start.toISOString()).toBe('2026-09-09T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('GET /api/cron/reconcile-provider-costs', () => {
  it('refuses a request that is not the cron', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('stores each provider figure in microUSD under its own source', async () => {
    vi.stubEnv(OPENAI_ADMIN_KEY_ENV, OPENAI_KEY);
    vi.stubEnv(ANTHROPIC_ADMIN_KEY_ENV, ANTHROPIC_KEY);
    vi.stubEnv(OPENROUTER_KEY_ENV, OPENROUTER_KEY);
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'organization/costs': {
          data: [{ results: [{ amount: { value: 1.5, currency: 'usd' } }] }],
        },
        cost_report: { data: [{ results: [{ amount: '250.5', currency: 'USD' }] }] },
        'auth/key': { data: { usage: 12 } },
      }),
    );

    const response = await GET(request());
    const body = (await response.json()) as { reported: number };

    expect(response.status).toBe(200);
    expect(body.reported).toBe(3);

    const written = mocks.execute.mock.calls.map((call) => call[1]);
    expect(written).toContainEqual(
      expect.arrayContaining(['openai', 1_500_000, OPENAI_COST_SOURCE]),
    );
    expect(written).toContainEqual(
      expect.arrayContaining(['anthropic', 2_505_000, ANTHROPIC_COST_SOURCE]),
    );
    expect(written).toContainEqual(
      expect.arrayContaining(['openrouter', 12_000_000, OPENROUTER_COST_SOURCE]),
    );
  });

  it('sends each provider its own credential and never logs one', async () => {
    vi.stubEnv(OPENAI_ADMIN_KEY_ENV, OPENAI_KEY);
    vi.stubEnv(ANTHROPIC_ADMIN_KEY_ENV, ANTHROPIC_KEY);
    const fetchMock = routeFetch({
      'organization/costs': { data: [] },
      cost_report: { data: [] },
    });
    vi.stubGlobal('fetch', fetchMock);

    await GET(request());

    const [openaiUrl, openaiInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(openaiUrl)).toContain('start_time=');
    expect((openaiInit?.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${OPENAI_KEY}`,
    );

    const anthropicInit = fetchMock.mock.calls[1]?.[1];
    const anthropicHeaders = anthropicInit?.headers as Record<string, string>;
    expect(anthropicHeaders['x-api-key']).toBe(ANTHROPIC_KEY);
    expect(anthropicHeaders['anthropic-version']).toBeTruthy();

    const logged = JSON.stringify([
      mocks.info.mock.calls,
      mocks.warn.mock.calls,
      mocks.error.mock.calls,
    ]);
    expect(logged).not.toContain(OPENAI_KEY);
    expect(logged).not.toContain(ANTHROPIC_KEY);
  });

  it('skips a provider whose credential is unset and names only the env var', async () => {
    vi.stubGlobal('fetch', routeFetch({}));

    const response = await GET(request());
    const body = (await response.json()) as {
      providers: Array<{ provider: string; status: string; detail?: string }>;
    };

    const openai = body.providers.find((entry) => entry.provider === 'openai');
    expect(openai?.status).toBe('not_configured');
    expect(openai?.detail).toBe(OPENAI_ADMIN_KEY_ENV);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reports the providers with no confirmed cost endpoint as unknown, once', async () => {
    vi.stubGlobal('fetch', routeFetch({}));

    const body = (await (await GET(request())).json()) as {
      providers: Array<{ provider: string; status: string }>;
    };

    const unknown = body.providers
      .filter((entry) => entry.status === 'unknown')
      .map((entry) => entry.provider);
    expect(unknown).toEqual([...UNREPORTED_PROVIDERS]);
    expect(
      mocks.info.mock.calls.filter(
        (call) => (call[0] as { event?: string }).event === 'provider_cost_report_unknown',
      ),
    ).toHaveLength(1);
  });

  it('reconciles the settled ledger over the same day it reported on', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    stubLedger({ costs: [settledCost()], delivered: [deliveredUsage()] });

    const body = (await (await GET(request())).json()) as {
      ledger: { status: string; findings: number };
    };

    expect(body.ledger).toEqual({
      status: 'reconciled',
      findings: 0,
      byFinding: { cost_without_usage: 0, usage_without_cost: 0, negative_margin: 0 },
    });
    const expected = yesterdayWindow(new Date());
    const windows = mocks.query.mock.calls.map((call) => (call[1] as string[]).slice(0, 2));
    expect(windows).toContainEqual([expected.start.toISOString(), expected.end.toISOString()]);
  });

  it('names a turn charged below what it cost, and every other disagreement', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    stubLedger({
      costs: [
        settledCost({ provider_cost_cents: 80, customer_canonical_microusd: 250_000 }),
        settledCost({ source_ref: 'managed_usage:user_1:key_2:hash_2' }),
      ],
      delivered: [
        deliveredUsage(),
        deliveredUsage({ idempotency_key: 'key_3', request_hash: 'hash_3' }),
      ],
    });

    const body = (await (await GET(request())).json()) as {
      ledger: { findings: number; byFinding: Record<string, number> };
    };

    expect(body.ledger.findings).toBe(3);
    expect(body.ledger.byFinding).toEqual({
      cost_without_usage: 1,
      usage_without_cost: 1,
      negative_margin: 1,
    });
    const [logged] = mocks.error.mock.calls.find(
      (call) => (call[0] as { event?: string }).event === 'managed_usage_reconciliation_findings',
    ) as [{ sourceRefs: string[] }];
    expect(logged.sourceRefs).toContain('managed_usage:user_1:key_3:hash_3');
  });

  it('answers 500 when the ledger cannot be reconciled, so the cron is retried', async () => {
    vi.stubGlobal('fetch', routeFetch({}));
    stubLedger({ fail: 'ledger read timed out' });

    const response = await GET(request());
    const body = (await response.json()) as { ledger: { status: string; detail: string } };

    expect(response.status).toBe(500);
    expect(body.ledger.status).toBe('failed');
    expect(body.ledger.detail).toBe('ledger read timed out');
  });

  it('answers 500 when a provider endpoint fails', async () => {
    vi.stubEnv(OPENAI_ADMIN_KEY_ENV, OPENAI_KEY);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
      ),
    );

    const response = await GET(request());
    const body = (await response.json()) as {
      providers: Array<{ provider: string; status: string }>;
    };

    expect(response.status).toBe(500);
    expect(body.providers.find((entry) => entry.provider === 'openai')?.status).toBe('failed');
  });
});
