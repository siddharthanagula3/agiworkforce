import { NextRequest } from 'next/server';
import {
  getPickerModelsForRuntimeProfile,
  listChatModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConfiguredProviders = vi.fn();
const mockAvailability = vi.fn();

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: () => null,
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: () => Promise.reject(new Error('anonymous')),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: () => Promise.reject(new Error('anonymous')),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => ({}) }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: () => mockConfiguredProviders(),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: (...args: unknown[]) => mockAvailability(...args),
}));
vi.mock('@/lib/server/free-pools', () => ({ freePoolDecisions: () => [] }));

const { GET: listOpenAiModels } = await import('@/app/api/llm/v1/models/route');
const { GET: getCatalogue } = await import('@/app/api/models/catalogue/route');

interface OpenAiModelList {
  data: Array<{ id: string }>;
}

interface CatalogueBody {
  models: Array<{ id: string; admitted: boolean }>;
}

const SURFACE_MODEL_IDS = new Set(
  getPickerModelsForRuntimeProfile('web/cloud-chat', {
    modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
  }).map((model) => model.id),
);

function everyRoutedProvider(): Set<string> {
  const providers = new Set<string>();
  for (const model of listChatModels()) {
    for (const route of listManagedRoutesForModel(model.id)) providers.add(route.provider);
  }
  return providers;
}

async function freeModelIdsFromOpenAiRoute(): Promise<string[]> {
  const response = await listOpenAiModels(
    new NextRequest('https://agiworkforce.com/api/llm/v1/models'),
  );
  const body = (await response.json()) as OpenAiModelList;
  return body.data.map((model) => model.id);
}

async function admittedFreeModelIdsFromCatalogue(): Promise<string[]> {
  const response = await getCatalogue(
    new NextRequest('https://agiworkforce.com/api/models/catalogue'),
  );
  const body = (await response.json()) as CatalogueBody;
  return body.models.filter((model) => model.admitted).map((model) => model.id);
}

describe('free-now agreement between the OpenAI-compatible list and the catalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAvailability.mockResolvedValue({});
  });

  it('offers an anonymous caller exactly the models the catalogue admits on that surface', async () => {
    mockConfiguredProviders.mockReturnValue(everyRoutedProvider());

    const offered = await freeModelIdsFromOpenAiRoute();
    const admitted = await admittedFreeModelIdsFromCatalogue();

    expect(offered.length).toBeGreaterThan(0);
    expect([...offered].sort()).toEqual(
      admitted.filter((modelId) => SURFACE_MODEL_IDS.has(modelId)).sort(),
    );
  });

  it('withdraws a model from both surfaces when no configured provider can serve it', async () => {
    const providers = everyRoutedProvider();
    const admittedEverywhere = new Set(
      (
        await (async () => {
          mockConfiguredProviders.mockReturnValue(providers);
          return admittedFreeModelIdsFromCatalogue();
        })()
      ).filter((modelId) => SURFACE_MODEL_IDS.has(modelId)),
    );

    const withdrawn = [...admittedEverywhere].find((modelId) => {
      const routes = listManagedRoutesForModel(modelId);
      return routes.length > 0 && routes.every((route) => route.provider === routes[0]?.provider);
    });
    expect(withdrawn).toBeDefined();

    const soleProvider = listManagedRoutesForModel(withdrawn as string)[0]?.provider as string;
    const reduced = new Set([...providers].filter((provider) => provider !== soleProvider));
    mockConfiguredProviders.mockReturnValue(reduced);

    expect(await freeModelIdsFromOpenAiRoute()).not.toContain(withdrawn);
    expect(await admittedFreeModelIdsFromCatalogue()).not.toContain(withdrawn);
  });
});
