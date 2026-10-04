// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { ProviderAdapterConfigMap, ProviderAdapterId } from '@agiworkforce/providers-factory';
type ProvidersFactoryModule = typeof import('@agiworkforce/providers-factory');

const { builtAdapters } = vi.hoisted(() => ({
  builtAdapters: [] as Array<{ adapterId: string; config: unknown }>,
}));

vi.mock('@agiworkforce/providers-factory', async (importOriginal) => {
  const actual = await importOriginal<ProvidersFactoryModule>();
  return {
    ...actual,
    createProviderAdapter: <ProviderId extends ProviderAdapterId>(
      adapterId: ProviderId,
      config: ProviderAdapterConfigMap[ProviderId],
    ) => {
      builtAdapters.push({ adapterId, config });
      return actual.createProviderAdapter(adapterId, config);
    },
  };
});

import { buildServerProviderAdapter } from '../provider-adapter-service';

const PLAIN_REQUEST: ChatRequest = {
  model: 'fixture-vendor/example-model',
  messages: [{ role: 'user', content: 'Name this conversation.' }],
};

let wireBodies: Array<Record<string, unknown>>;

async function providerFieldSentFor(request: ChatRequest): Promise<unknown> {
  const adapter = buildServerProviderAdapter('openrouter');
  for await (const chunk of adapter.stream(request, new AbortController().signal)) {
    void chunk;
  }
  expect(wireBodies).toHaveLength(1);
  return wireBodies[0]?.['provider'];
}

beforeEach(() => {
  builtAdapters.length = 0;
  wireBodies = [];
  vi.stubEnv('OPENROUTER_API_KEY', 'fixture-openrouter-key');
  vi.stubEnv('OPENROUTER_BASE_URL', '');
  vi.stubGlobal('fetch', async (_input: unknown, init?: { body?: unknown }) => {
    wireBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response('data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('managed OpenRouter adapter', () => {
  it('requires data collection to be denied and keeps price ordering as the overridable default', () => {
    buildServerProviderAdapter('openrouter');

    expect(builtAdapters).toEqual([
      {
        adapterId: 'open_router',
        config: expect.objectContaining({
          providerRouting: { sort: 'price' },
          requiredProviderRouting: { dataCollection: 'deny' },
        }),
      },
    ]);
  });

  it('denies data collection on a request that sets neither the zero-retention requirement nor routing metadata', async () => {
    expect(await providerFieldSentFor(PLAIN_REQUEST)).toEqual({
      sort: 'price',
      data_collection: 'deny',
    });
  });

  it('denies data collection beside a price ceiling from request metadata', async () => {
    expect(
      await providerFieldSentFor({
        ...PLAIN_REQUEST,
        metadata: { openRouterProviderRouting: { maxPrice: { prompt: 2, completion: 12 } } },
      }),
    ).toEqual({
      sort: 'price',
      data_collection: 'deny',
      max_price: { prompt: 2, completion: 12 },
    });
  });

  it('keeps zdr and the denial on a request with the zero-retention requirement', async () => {
    expect(await providerFieldSentFor({ ...PLAIN_REQUEST, zeroDataRetentionOnly: true })).toEqual({
      sort: 'price',
      data_collection: 'deny',
      zdr: true,
    });
  });

  it('does not let request metadata allow data collection', async () => {
    expect(
      await providerFieldSentFor({
        ...PLAIN_REQUEST,
        metadata: {
          openRouterProviderRouting: { dataCollection: 'allow', order: ['fixture-host'] },
        },
      }),
    ).toEqual({
      order: ['fixture-host'],
      data_collection: 'deny',
      sort: 'price',
    });
  });
});
