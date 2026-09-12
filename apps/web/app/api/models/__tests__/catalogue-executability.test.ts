import { NextRequest } from 'next/server';
import { listCanonicalModels, listManagedRoutesForModel } from '@agiworkforce/types';
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

const { GET, buildCatalogueEntries } = await import('@/app/api/models/catalogue/route');

type CatalogueModel = Awaited<ReturnType<typeof buildCatalogueEntries>>[number];
interface CatalogueBody {
  models: CatalogueModel[];
}

/**
 * The admission decision with its route evidence, which is what these rules are
 * about. The HTTP body deliberately drops the routes, so asserting on the body
 * would only measure the redaction.
 */
async function fetchCatalogue(): Promise<{ models: CatalogueModel[] }> {
  return { models: await buildCatalogueEntries('free') };
}

async function fetchWireBody(): Promise<CatalogueBody> {
  const res = await GET(new NextRequest('https://agiworkforce.com/api/models/catalogue'));
  return (await res.json()) as CatalogueBody;
}

/**
 * The hard invariant: customer selectable requires at least one actually
 * executable approved managed route.
 *
 * Production served two open-weight models as admitted with an empty route
 * list, because their only approved managed route is on a provider this
 * deployment holds no credential for. Admission consulted the entitlement
 * tables and never asked whether anything could serve the request.
 */
describe('model catalogue · executability gates selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkUser.mockRejectedValue(new Error('anonymous'));
    mockGetSubscription.mockResolvedValue(null);
    mockAvailability.mockResolvedValue({});
  });

  it('omits a model no configured provider can serve', async () => {
    // Production's shape: one provider in the registry holds no credential here.
    const configured = new Set([
      'openai',
      'google',
      'anthropic',
      'deepseek',
      'qwen',
      'zhipu',
      'open_router',
    ]);
    mockConfiguredProviders.mockReturnValue(configured);

    const body = await fetchCatalogue();
    const served = new Set(body.models.map((m) => m.id));

    // Derived rather than named, so this keeps testing the rule after the next
    // curation edit: a model reachable by no configured provider must be absent,
    // whichever models those turn out to be.
    const unservable = listCanonicalModels()
      .map((model) => model.id)
      .filter((id) =>
        listManagedRoutesForModel(id).every((route) => !configured.has(route.provider)),
      );

    expect(unservable.length).toBeGreaterThan(0);
    for (const id of unservable) expect(served.has(id)).toBe(false);
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
    const freeModel = body.models.find(
      (m) => m.admitted && m.routes.length > 0 && m.minimumPlanLabel === null,
    );

    expect(freeModel).toBeDefined();
    expect(freeModel?.admitted).toBe(true);
    expect(freeModel?.routes.length).toBeGreaterThan(0);
  });
});

/**
 * The picker stopped naming suppliers, but the endpoint behind it kept sending
 * them: unauthenticated, for all 27 models, an anonymous visitor could read
 * which reseller and which gateway carry each model, the internal route ids,
 * and which routes we hold free inventory on. No client ever read the field.
 *
 * Route detail is how admission reasons, not something the customer needs.
 */
describe('model catalogue · the wire body names no supplier', () => {
  const SUPPLIER_WORDS = [
    'Cheaper Inference',
    'Experiential Labs',
    'Vercel AI Gateway',
    'Model Studio',
    'Bedrock',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkUser.mockRejectedValue(new Error('anonymous'));
    mockGetSubscription.mockResolvedValue(null);
    mockAvailability.mockResolvedValue({});
    mockConfiguredProviders.mockReturnValue(
      new Set(['openai', 'google', 'anthropic', 'deepseek', 'qwen', 'zhipu', 'open_router']),
    );
  });

  it('sends no route detail at all', async () => {
    const body = await fetchWireBody();

    expect(body.models.length).toBeGreaterThan(0);
    for (const model of body.models) {
      expect(model).not.toHaveProperty('routes');
    }
  });

  it('still tells the client a model is backed, without naming what backs it', async () => {
    const body = await fetchWireBody();

    for (const model of body.models) expect(model.routeCount).toBeGreaterThan(0);
  });

  it('mentions no supplier anywhere in the payload', async () => {
    const serialised = JSON.stringify(await fetchWireBody());

    for (const word of SUPPLIER_WORDS) expect(serialised).not.toContain(word);
  });

  it('keeps the route evidence on the server, where admission uses it', async () => {
    const entries = await buildCatalogueEntries('free');

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.routes.length).toBe(entry.routeCount);
  });
});

/**
 * Configured is not the same as healthy, and the difference is not cosmetic. On
 * 2026-09-12 Anthropic answered every Claude route with an unfunded-account
 * error; the catalogue kept offering Claude as selectable, so the only way to
 * learn it was broken was to send a turn and get a 400 back.
 *
 * A degraded route must not delete what the registry knows: the model keeps its
 * description, its price and its routes, and recovers by itself when the health
 * mark expires. Only its selectability changes.
 */
describe('model catalogue · configured is not the same as healthy', () => {
  const CREDENTIALED = [
    'openai',
    'google',
    'anthropic',
    'deepseek',
    'qwen',
    'zhipu',
    'open_router',
  ];
  const DEGRADED = { state: 'degraded' as const, reason: 'x', until: '2026-09-12T23:00:00Z' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkUser.mockRejectedValue(new Error('anonymous'));
    mockGetSubscription.mockResolvedValue(null);
    mockConfiguredProviders.mockReturnValue(new Set(CREDENTIALED));
    mockAvailability.mockResolvedValue({});
  });

  async function anthropicOnlyModels(): Promise<CatalogueBody['models']> {
    const body = await fetchCatalogue();
    return body.models.filter(
      (m) => m.routes.length > 0 && m.routes.every((r) => r.provider === 'anthropic'),
    );
  }

  it('guards the fixture: some models are served only by the degraded provider', async () => {
    expect((await anthropicOnlyModels()).length).toBeGreaterThan(0);
  });

  it('flags a model every route of which is degraded', async () => {
    mockAvailability.mockResolvedValue({ anthropic: DEGRADED });

    for (const model of await anthropicOnlyModels()) {
      expect(model.temporarilyUnavailable).toBe(true);
    }
  });

  it('keeps the model in the catalogue rather than forgetting it', async () => {
    const healthy = (await anthropicOnlyModels()).map((m) => m.id).sort();
    mockAvailability.mockResolvedValue({ anthropic: DEGRADED });
    const degraded = (await anthropicOnlyModels()).map((m) => m.id).sort();

    expect(degraded).toEqual(healthy);
    expect(degraded.length).toBeGreaterThan(0);
  });

  it('keeps its routes visible, marked degraded, so the state is explainable', async () => {
    mockAvailability.mockResolvedValue({ anthropic: DEGRADED });

    for (const model of await anthropicOnlyModels()) {
      expect(model.routes.length).toBeGreaterThan(0);
      for (const route of model.routes) expect(route.status).toBe('degraded');
    }
  });

  it('leaves a model with a healthy route alone', async () => {
    mockAvailability.mockResolvedValue({ anthropic: DEGRADED });

    const body = await fetchCatalogue();
    const mixed = body.models.filter((m) => m.routes.some((r) => r.provider !== 'anthropic'));

    expect(mixed.length).toBeGreaterThan(0);
    for (const model of mixed) expect(model.temporarilyUnavailable).toBe(false);
  });

  it('reports every model healthy while the provider is fine', async () => {
    for (const model of await anthropicOnlyModels()) {
      expect(model.temporarilyUnavailable).toBe(false);
    }
  });

  it('recovers with no deploy once the mark expires', async () => {
    mockAvailability.mockResolvedValue({ anthropic: DEGRADED });
    expect((await anthropicOnlyModels()).every((m) => m.temporarilyUnavailable)).toBe(true);

    mockAvailability.mockResolvedValue({});
    expect((await anthropicOnlyModels()).some((m) => m.temporarilyUnavailable)).toBe(false);
  });
});
