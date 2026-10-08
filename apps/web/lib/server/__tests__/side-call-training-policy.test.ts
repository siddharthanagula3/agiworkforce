import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { resolveAutoRoute, type AutoRoutingRequest } from '@agiworkforce/routing';
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  managedProviderIds: vi.fn<() => Set<string>>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterServiceModule>()),
  listAvailableManagedProviderIds: () => mocks.managedProviderIds(),
}));

import { sideCallRoutingRequest } from '../side-call-training-policy';

const BASE: AutoRoutingRequest = {
  selection: 'auto',
  taskType: 'simple_chat',
  subscriptionTier: 'free',
  trustMode: 'managed_cloud',
  runtimeProfileId: 'web/cloud-chat',
};

function dbAnswering(optedOut: boolean | null | Error): Pick<DatabaseAdapter, 'query'> {
  return {
    query: vi.fn(async () => {
      if (optedOut instanceof Error) throw optedOut;
      return [{ opted_out: optedOut }];
    }) as unknown as DatabaseAdapter['query'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.managedProviderIds.mockReturnValue(new Set(['anthropic', 'open_router', 'xai']));
});

describe('side-call routing under the provider-training opt-out', () => {
  it('leaves the request alone when the account has not opted out', async () => {
    const routing = await sideCallRoutingRequest(dbAnswering(false), 'user-1', BASE);

    expect(routing).toBe(BASE);
  });

  it('makes training an admission rule, not a ranking, when the account opted out', async () => {
    const routing = await sideCallRoutingRequest(dbAnswering(true), 'user-1', BASE);

    expect(routing).toMatchObject({ noTrainingOnly: true });
    expect([...(routing?.availableProviderIds ?? [])]).toEqual(['anthropic']);
  });

  it('treats an unreadable setting as opted out', async () => {
    const routing = await sideCallRoutingRequest(dbAnswering(new Error('down')), 'user-1', BASE);

    expect(routing).toMatchObject({ noTrainingOnly: true });
  });

  it('refuses outright when no managed provider keeps inputs out of training', async () => {
    mocks.managedProviderIds.mockReturnValue(new Set(['open_router', 'xai']));

    expect(await sideCallRoutingRequest(dbAnswering(true), 'user-1', BASE)).toBeNull();
  });

  it('never resolves the free side-call lane to a provider that may train', async () => {
    const routing = await sideCallRoutingRequest(dbAnswering(true), 'user-1', BASE);
    const route = routing ? resolveAutoRoute(routing) : null;

    if (route?.status === 'selected') {
      expect(providerKeepsInputsOutOfTraining(route.provider)).toBe(true);
    }
  });
});
