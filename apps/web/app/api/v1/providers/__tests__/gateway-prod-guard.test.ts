/**
 * Tests: production gateway URL guard for providers routes.
 *
 * Covers:
 *   - GET /api/v1/providers         (route.ts)
 *   - GET /api/v1/providers/:id/catalog ([providerId]/catalog/route.ts)
 *
 * Guard mirrors the one already in [providerId]/stream/route.ts lines 131-142:
 *   when NODE_ENV==='production' and API_GATEWAY_URL is not https -> 503 'Gateway misconfigured'.
 *
 * Each case FAILS without the guard (fetch mock returns 200) and PASSES with it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── shared hoisted mocks ─────────────────────────────────────────────────────

const { mockWithRateLimit, mockGetEnv, mockLoggerError } = vi.hoisted(() => ({
  mockWithRateLimit: vi.fn(),
  mockGetEnv: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockWithRateLimit }));
vi.mock('@shared/utils/env', () => ({ getEnv: mockGetEnv }));
vi.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

// mockFetch is re-implemented in beforeEach because vitest's mockReset:true
// clears implementations between tests.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── imports (after mocks) ────────────────────────────────────────────────────

import { GET as providersGET } from '../route';
import { GET as catalogGET } from '../[providerId]/catalog/route';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string) {
  return new Request(url, { method: 'GET' }) as never;
}

function makeCatalogContext(providerId: string) {
  return { params: Promise.resolve({ providerId }) };
}

function makeOkResponse() {
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  // Restore defaults after mockReset clears them.
  // withRateLimit returning null means "no rate-limit hit, continue".
  mockWithRateLimit.mockResolvedValue(null);
  // fetch returns 200 by default · without the prod guard, routes proxy this
  // through and return 200, so a 503 assertion would fail.
  mockFetch.mockImplementation(() => Promise.resolve(makeOkResponse()));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── GET /api/v1/providers ────────────────────────────────────────────────────

describe('GET /api/v1/providers · production gateway guard', () => {
  it('returns 503 when NODE_ENV=production and API_GATEWAY_URL is http (non-https)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetEnv.mockReturnValue('http://localhost:3000');

    const res = await providersGET(makeRequest('http://localhost/api/v1/providers'));

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['error']).toBe('Gateway misconfigured');
    // fetch should NOT be called · guard fires before upstream request
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 503 when NODE_ENV=production and API_GATEWAY_URL is the bare default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Simulate the unset-env case: getEnv falls back to 'http://localhost:3000'
    mockGetEnv.mockReturnValue('http://localhost:3000');

    const res = await providersGET(makeRequest('http://localhost/api/v1/providers'));

    expect(res.status).toBe(503);
  });

  it('proxies and returns upstream status when NODE_ENV=production and API_GATEWAY_URL is https', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetEnv.mockReturnValue('https://api.example.com');

    const res = await providersGET(makeRequest('http://localhost/api/v1/providers'));

    // fetch was called with the https upstream URL
    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toMatch(/^https:\/\/api\.example\.com/);
    // status is proxied from the mocked upstream 200
    expect(res.status).toBe(200);
  });

  it('does NOT apply the guard outside production (NODE_ENV=test)', async () => {
    // NODE_ENV defaults to 'test' in vitest · no need to stub
    mockGetEnv.mockReturnValue('http://localhost:3000');

    const res = await providersGET(makeRequest('http://localhost/api/v1/providers'));

    // Guard is skipped; fetch is called and upstream 200 is proxied
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});

// ── GET /api/v1/providers/:providerId/catalog ────────────────────────────────

describe('GET /api/v1/providers/:id/catalog · production gateway guard', () => {
  it('returns 503 when NODE_ENV=production and API_GATEWAY_URL is http (non-https)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetEnv.mockReturnValue('http://internal-gateway');

    const res = await catalogGET(
      makeRequest('http://localhost/api/v1/providers/anthropic/catalog'),
      makeCatalogContext('anthropic'),
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['error']).toBe('Gateway misconfigured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 503 when NODE_ENV=production and API_GATEWAY_URL is the bare default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetEnv.mockReturnValue('http://localhost:3000');

    const res = await catalogGET(
      makeRequest('http://localhost/api/v1/providers/openai/catalog'),
      makeCatalogContext('openai'),
    );

    expect(res.status).toBe(503);
  });

  it('proxies and returns upstream status when NODE_ENV=production and API_GATEWAY_URL is https', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGetEnv.mockReturnValue('https://api.example.com');

    const res = await catalogGET(
      makeRequest('http://localhost/api/v1/providers/anthropic/catalog'),
      makeCatalogContext('anthropic'),
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toMatch(/^https:\/\/api\.example\.com.*anthropic.*catalog/);
    expect(res.status).toBe(200);
  });

  it('does NOT apply the guard outside production (NODE_ENV=test)', async () => {
    mockGetEnv.mockReturnValue('http://localhost:3000');

    const res = await catalogGET(
      makeRequest('http://localhost/api/v1/providers/google/catalog'),
      makeCatalogContext('google'),
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});
