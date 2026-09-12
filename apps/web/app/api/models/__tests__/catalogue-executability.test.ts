import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConfiguredProviders = vi.fn();
const mockAvailability = vi.fn();
const mockClerkUser = vi.fn();
const mockGetSubscription = vi.fn();

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: () => null,
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mockClerkUser(...a) }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => ({}) }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...a: unknown[]) => mockGetSubscription(...a) },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: () => mockConfiguredProviders(),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: (...a: unknown[]) => mockAvailability(...a),
}));
vi.mock('@/lib/server/free-pools', () => ({ freePoolDecisions: () => [] }));

const { GET } = await import('@/app/api/models/catalogue/route');

interface CatalogueBody {
  models: { id: string; admitted: boolean; routes: { provider: string }[] }[];
}

async function fetchCatalogue(): Promise<CatalogueBody> {
  const res = await GET(new NextRequest('https://agiworkforce.com/api/models/catalogue'));
  return (await res.json()) as CatalogueBody;
}

/**
 * The hard invariant: customer selectable requires at least one actually
 * executable approved managed route.
 *
 * Production served gpt-oss-120b and gpt-oss-20b as admitted with an empty
 * route list, because their only approved managed route is on Groq and this
 * deployment holds no Groq credential. Admission consulted the entitlement
 * tables and never asked whether anything could serve the request.
 */
describe('model catalogue · executability gates selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkUser.mockRejectedValue(new Error('anonymous'));
    mockGetSubscription.mockResolvedValue(null);
    mockAvailability.mockResolvedValue({});
  });

  it('omits a model whose only approved route has no configured provider', async () => {
    // Everything except Groq is credentialed, which is production's shape.
    mockConfiguredProviders.mockReturnValue(
      new Set(['openai', 'google', 'anthropic', 'deepseek', 'qwen', 'zhipu', 'open_router']),
    );

    const body = await fetchCatalogue();
    const ids = body.models.map((m) => m.id);

    expect(ids).not.toContain('gpt-oss-120b');
    expect(ids).not.toContain('gpt-oss-20b');
  });

  it('never returns an entry that is admitted with no routes', async () => {
    mockConfiguredProviders.mockReturnValue(new Set(['openai', 'google', 'open_router']));

    const body = await fetchCatalogue();

    for (const model of body.models) {
      expect(model.routes.length).toBeGreaterThan(0);
      if (model.admitted) expect(model.routes.length).toBeGreaterThan(0);
    }
  });

  it('drops every model when no provider is configured', async () => {
    mockConfiguredProviders.mockReturnValue(new Set<string>());

    const body = await fetchCatalogue();

    expect(body.models).toEqual([]);
  });

  it('only lists routes whose provider is configured', async () => {
    mockConfiguredProviders.mockReturnValue(new Set(['openai']));

    const body = await fetchCatalogue();

    expect(body.models.length).toBeGreaterThan(0);
    for (const model of body.models) {
      for (const route of model.routes) expect(route.provider).toBe('openai');
    }
  });

  it('keeps a credentialed free model selectable for an anonymous visitor', async () => {
    mockConfiguredProviders.mockReturnValue(new Set(['openai', 'google', 'open_router']));

    const body = await fetchCatalogue();
    const luna = body.models.find((m) => m.id === 'gpt-5.6-luna');

    expect(luna).toBeDefined();
    expect(luna?.admitted).toBe(true);
    expect(luna?.routes.length).toBeGreaterThan(0);
  });
});
