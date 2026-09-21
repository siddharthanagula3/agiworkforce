import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';

import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';
import { recordConfigurationState } from '@/lib/observability/metrics';

const stripeMocks = vi.hoisted(() => ({
  retrievePrice: vi.fn(),
}));

const originalEnv = { ...process.env };

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  getConfiguredStripePriceIds: vi.fn(() => ['price_configured']),
}));

vi.mock('stripe', () => ({
  default: class MockStripe {
    products = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    };
    prices = {
      retrieve: stripeMocks.retrievePrice,
    };
  },
}));

const mockNeonQuery = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getDefaultModelFor: () => 'model-under-test',
  getModelMetadataById: () => ({ id: 'model-under-test' }),
  isModelLive: () => true,
  listManagedRoutesForModel: () => [{ routeId: 'route-a', provider: 'provider-under-test' }],
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: () => new Set(['provider-under-test']),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: async () => ({}),
}));
vi.mock('@/lib/jobs/job-service', () => ({
  readJobQueueStats: async () => [
    { queue: 'default', queued: 0, running: 0, dead: 0, oldestQueuedAgeMs: 0, stuck: 0 },
  ],
}));
// The cache check is a real round trip, so without a store this suite would be
// measuring whether a test host can reach a Redis that does not exist.
vi.mock('@/lib/server/key-value', async (importOriginal) => {
  const { createMemoryKeyValueStore } = await import('@agiworkforce/key-value');
  const store = createMemoryKeyValueStore();
  return {
    ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
    getKeyValueStore: () => store,
  };
});
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockNeonQuery,
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

import { GET } from '@/app/api/health/route';

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.test';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_health';
    process.env['CLERK_SECRET_KEY'] = 'sk_test_health';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_123';
    stripeMocks.retrievePrice.mockResolvedValue({
      active: true,
      type: 'recurring',
      recurring: { interval: 'month' },
    });
    mockNeonQuery.mockImplementation(async (sql: string) =>
      sql.includes('missing_relations')
        ? [
            {
              missing_relations: 0,
              full_text_index: true,
              embedding_index: true,
              vector_extension: true,
            },
          ]
        : [{ '?column?': 1 }],
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all checks pass', async () => {
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.checks).toBeDefined();
      expect(data.checks.database.status).toBe('healthy');
      expect(data.checks.stripe.status).toBe('healthy');
      expect(data.checks.environment.status).toBe('healthy');
    });

    it('should return unhealthy status when database check fails', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('unhealthy');
      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.message).toBe('unavailable');
    });

    it('should return unhealthy status when Stripe check fails', async () => {
      delete process.env['STRIPE_SECRET_KEY'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.stripe.status).toBe('unhealthy');
      expect(data.checks.stripe.message).toBe('unavailable');
    });

    it('reports Stripe degraded when a configured Price is unreachable under the key', async () => {
      stripeMocks.retrievePrice.mockRejectedValueOnce(
        new Error('Configured Price is not available to this Stripe account or mode'),
      );

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.checks.stripe).toEqual({ status: 'unhealthy', message: 'unavailable' });
    });

    it('should return unhealthy status when environment variables are missing', async () => {
      delete process.env['DATABASE_URL'];
      delete process.env['AGI_DATABASE_URL'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.environment.status).toBe('unhealthy');
      expect(data.checks.environment.missingCount).toBeGreaterThan(0);
    });

    it('should handle empty result from DB as healthy (no rows found)', async () => {
      mockNeonQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);

      const data = await response.json();
      expect(data.checks.database.status).toBe('healthy');
    });

    it('forbids caching so an external monitor cannot be answered from a stale copy', async () => {
      const healthy = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      expect(healthy.status).toBe(200);
      expect(healthy.headers.get('cache-control')).toBe('no-store');

      mockNeonQuery.mockRejectedValueOnce(new Error('Connection failed'));
      const down = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      expect(down.status).toBe(503);
      expect(down.headers.get('cache-control')).toBe('no-store');
    });

    it('should include timestamp in response', async () => {
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should handle missing Stripe key gracefully', async () => {
      delete process.env['STRIPE_SECRET_KEY'];

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.stripe.status).toBe('unhealthy');
      expect(data.checks.stripe.message).toBe('unavailable');
    });

    it('does not expose internal dependency names or environment variable names', async () => {
      delete process.env['E2B_API_KEY'];
      process.env['AGI_OTEL_EXPORTER_ENDPOINT'] = 'https://otel.example';

      const response = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      const data = await response.json();

      expect(data.checks.environment).toEqual({ status: 'healthy' });
      expect(JSON.stringify(data)).not.toContain('unreadyDependencies');
      expect(JSON.stringify(data)).not.toContain('E2B_API_KEY');
      expect(JSON.stringify(data)).not.toContain('code_execution');
    });

    it('accounts for every registered dependency without naming one', async () => {
      const response = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      const data = await response.json();

      const { total, ok, failing, unconfigured, unobserved } = data.dependencyCounts;
      expect(total).toBe(PRODUCTION_DEPENDENCIES.length);
      expect(ok + failing + unconfigured + unobserved).toBe(total);
      const checkNames = Object.keys(data.checks);
      for (const dependency of PRODUCTION_DEPENDENCIES) {
        if (checkNames.includes(dependency.id)) continue;
        expect(JSON.stringify(data)).not.toContain(dependency.id);
      }
    });

    it('counts boot-time configuration findings without naming the component', async () => {
      recordConfigurationState({ component: 'environment-production-values', state: 'invalid' });

      const response = await GET(new NextRequest('http://localhost/api/health', { method: 'GET' }));
      const data = await response.json();

      expect(data.configurationFindings).toBeGreaterThan(0);
      expect(JSON.stringify(data)).not.toContain('environment-production-values');
    });

    it('should handle DB connection failure gracefully', async () => {
      mockNeonQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.database.status).toBe('unhealthy');
      expect(data.checks.database.message).toBe('unavailable');
    });
  });
});

describe('public health route load shape', () => {
  // The checks make 1 + N Stripe API calls plus a database round trip and the
  // answer is identical for every caller, so running them per request turned a
  // public URL into a traffic-proportional load generator against the exact
  // dependencies an incident is already straining. `no-store` on the response
  // means no CDN can dedupe it either, so the memoisation has to be server-side.
  it('serves from the memoised checks, not a fresh run per request', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/health/route.ts'), 'utf8');
    expect(source).toContain('getCachedHealthChecks');
    expect(source).not.toMatch(/\bawait runHealthChecks\(/);
  });

  it('declares its own duration ceiling instead of inheriting dashboard state', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/health/route.ts'), 'utf8');
    expect(source).toMatch(/export const maxDuration = \d+/);
  });
});
