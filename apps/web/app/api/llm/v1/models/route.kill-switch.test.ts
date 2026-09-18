import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@/lib/cors', () => ({ getCorsHeaders: vi.fn(() => ({})) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/data-region', () => ({ managedCloudDataRegion: () => 'us-east-1' }));

const authMocks = vi.hoisted(() => ({
  db: { query: async () => [], execute: async () => 0 },
  getClerkAuthUser: vi.fn(),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (...args: unknown[]) => {
    const { userId } = (await authMocks.getClerkAuthUser(...args)) as { userId: string };
    return { db: authMocks.db, userId, organizationId: null };
  },
}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authMocks.getClerkAuthUser }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => ({}) }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: () => everyRoutedProvider(),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: vi.fn(async () => ({})),
}));
vi.mock('@/lib/server/free-pools', () => ({ freePoolDecisions: () => [] }));

const flags = vi.hoisted(() => ({ definitions: [] as unknown[] }));
vi.mock('@/lib/feature-flags/flag-store', () => ({
  getActiveFlagDefinitions: async () => flags.definitions,
  getSubjectOverrides: async () => [],
}));

import { listChatModels, listManagedRoutesForModel } from '@agiworkforce/types';
import { killSwitchDefinition, modelKillSwitchKey } from '@/lib/feature-flags/kill-switches';
import { GET } from './route';

function everyRoutedProvider(): Set<string> {
  const providers = new Set<string>();
  for (const model of listChatModels()) {
    for (const route of listManagedRoutesForModel(model.id)) providers.add(route.provider);
  }
  return providers;
}

function definition(key: string) {
  return {
    ...killSwitchDefinition(key, `switch for ${key}`),
    killSwitch: true,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  };
}

function request(): NextRequest {
  return new NextRequest('https://example.com/api/llm/v1/models');
}

async function listedModelIds(): Promise<string[]> {
  authMocks.getClerkAuthUser.mockRejectedValueOnce(new Error('No session'));
  const body = (await (await GET(request())).json()) as { data: { id: string }[] };
  return body.data.map((model) => model.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.definitions = [];
});

describe('GET /api/llm/v1/models under a kill switch', () => {
  it('drops a model the moment its switch is flipped, with no redeploy', async () => {
    const before = await listedModelIds();
    const killed = before[0];
    expect(killed).toBeDefined();

    flags.definitions = [definition(modelKillSwitchKey(killed as string))];
    const after = await listedModelIds();

    expect(after).not.toContain(killed);
    expect(after).toEqual(before.filter((id) => id !== killed));
  });

  it('drops every model a switched-off provider was the only route for', async () => {
    const before = await listedModelIds();
    const providers = [...everyRoutedProvider()];
    const killedProvider = providers[0] as string;
    const stillRoutable = before.filter((id) =>
      listManagedRoutesForModel(id).some((route) => route.provider !== killedProvider),
    );

    flags.definitions = [definition(`provider.${killedProvider.toLowerCase()}`)];
    const after = await listedModelIds();

    expect(after).toEqual(stillRoutable);
  });

  it('serves the whole catalogue while no switch exists', async () => {
    const withoutFlags = await listedModelIds();
    expect(withoutFlags.length).toBeGreaterThan(0);
  });
});
