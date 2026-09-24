// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configuredExperientialFreeOfferings,
  loadExperientialFreeOfferings,
} from './experiential-free';

afterEach(() => vi.unstubAllGlobals());

describe('Experiential Labs live promotions', () => {
  const config = { baseUrl: 'https://api.experientiallabs.ai/v1', apiKey: 'fixture-key' };

  it('offers only curated chat models that are both promoted and granted as free', async () => {
    const entries = configuredExperientialFreeOfferings();
    expect(entries).toHaveLength(5);
    const freeSlug = entries[0]!.offering.providerModelId;
    const discountedSlug = entries[1]!.offering.providerModelId;
    const ungrantedSlug = entries[2]!.offering.providerModelId;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL, init?: RequestInit) => {
        if (url.pathname === '/api/v1/models') {
          expect(init?.headers).toEqual({ Authorization: 'Bearer fixture-key' });
          return Response.json({
            data: [
              { id: `vendor/${freeSlug}:free`, canonical_slug: freeSlug },
              { id: `vendor/${discountedSlug}`, canonical_slug: discountedSlug },
              { id: `vendor/${ungrantedSlug}`, canonical_slug: ungrantedSlug },
            ],
          });
        }
        return Response.json({
          promotions: [
            null,
            { free: false, slugs: [discountedSlug] },
            { free: true, slugs: [freeSlug, ungrantedSlug] },
          ],
        });
      }),
    );

    const result = await loadExperientialFreeOfferings(config);
    expect(result?.filter((entry) => entry.promotional).map((entry) => entry.key)).toEqual([
      entries[0]!.key,
    ]);
  });

  it('fails closed when the provider cannot supply promotions or authenticated grants', async () => {
    const freeSlug = configuredExperientialFreeOfferings()[0]!.offering.providerModelId;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ promotions: null })),
    );

    expect(await loadExperientialFreeOfferings(config)).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) =>
        url.pathname === '/api/v1/models'
          ? new Response('{}', { status: 403 })
          : Response.json({ promotions: [{ free: true, slugs: [freeSlug] }] }),
      ),
    );

    expect(await loadExperientialFreeOfferings(config)).toBeNull();
  });
});
