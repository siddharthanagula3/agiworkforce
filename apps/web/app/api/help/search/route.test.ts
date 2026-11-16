import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/support/agent/corpus');
type RetrieveModule = typeof import('@/lib/support/agent/retrieval/retrieve');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(async () => null as unknown),
  getSupportCorpus: vi.fn(),
  retrieveSupportChunks: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/support/agent/corpus', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getSupportCorpus: mocks.getSupportCorpus,
}));
vi.mock('@/lib/support/agent/retrieval/retrieve', () => ({
  retrieveSupportChunks: mocks.retrieveSupportChunks,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';
import { PURCHASE_HELP_CATEGORY } from '@/lib/support/help-articles';
import { supportCollectionIndex } from '@/app/help/collections';

import { GET } from './route';

function request(query: string): Request {
  return new Request(`https://agiworkforce.com/api/help/search?${query}`);
}

function chunk(docId: string, title: string) {
  return {
    chunk: { docId, path: `/${docId}`, category: 'product' },
    score: 1,
    citation: { title, url: `https://agiworkforce.com/${docId}`, snippet: `about ${title}` },
  };
}

describe('GET /api/help/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getSupportCorpus.mockReturnValue({ available: true, chunks: [], byId: new Map() });
    mocks.retrieveSupportChunks.mockReturnValue({ chunks: [], passedFloor: false });
  });

  it('refuses a query shorter than two characters instead of scanning the corpus', async () => {
    const response = await GET(request('q=a') as never);
    expect(response.status).toBe(400);
    expect(mocks.retrieveSupportChunks).not.toHaveBeenCalled();
  });

  it('returns one result per document, keeping the best chunk of each', async () => {
    mocks.retrieveSupportChunks.mockReturnValue({
      chunks: [
        chunk('byok', 'Bring your own key'),
        chunk('byok', 'BYOK, limits'),
        chunk('cli', 'CLI'),
      ],
      passedFloor: true,
    });

    const response = await GET(request('q=bring+your+own+key') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.map((result: { docId: string }) => result.docId)).toEqual(['byok', 'cli']);
    expect(body.results[0].title).toBe('Bring your own key');
  });

  it('links a markdown match to its full article rather than the related product page', async () => {
    const hit = chunk('usage-and-credits', 'Usage and credits');
    mocks.retrieveSupportChunks.mockReturnValue({
      chunks: [{ ...hit, chunk: { ...hit.chunk, origin: 'markdown', path: '/pricing' } }],
      passedFloor: true,
    });
    const response = await GET(request('q=credits') as never);
    const body = await response.json();
    expect(body.results[0].path).toBe('/help/usage-and-credits');
    expect(new URL(body.results[0].url).pathname).toBe('/help/usage-and-credits');
  });

  /**
   * An empty list and an unloadable index are different answers. Returning 200
   * with no results for a broken index is how a search page tells a reader that
   * the product has no documentation about their problem.
   */
  it('answers 503 when the corpus cannot load, not an empty result set', async () => {
    mocks.getSupportCorpus.mockReturnValue({ available: false, reason: 'duplicate chunk id' });

    const response = await GET(request('q=billing') as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.corpus).toBe('unavailable');
    expect(body.results).toEqual([]);
  });

  it('stops at the rate limiter before touching the corpus', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request('q=billing') as never);

    expect(response.status).toBe(429);
    expect(mocks.getSupportCorpus).not.toHaveBeenCalled();
  });

  describe('opened from the phone', () => {
    const marker = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;

    function article(docId: string, title: string, category = 'product') {
      const hit = chunk(docId, title);
      return { ...hit, chunk: { ...hit.chunk, origin: 'markdown', category } };
    }

    function purchaseAndProductHits() {
      return {
        chunks: [
          article('plans-and-invoices', 'Plans and invoices', PURCHASE_HELP_CATEGORY),
          article('byok', 'Bring your own key'),
        ],
        passedFloor: true,
      };
    }

    it('leaves purchase articles out of the results', async () => {
      mocks.retrieveSupportChunks.mockReturnValue(purchaseAndProductHits());

      const response = await GET(request(`q=upgrade&${marker}`) as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results.map((result: { docId: string }) => result.docId)).toEqual(['byok']);
      expect(
        body.results.some(
          (result: { category: string }) => result.category === PURCHASE_HELP_CATEGORY,
        ),
      ).toBe(false);
    });

    it('leaves out entries the help index on the phone does not list', async () => {
      const summary = chunk('static-article:getting-started', 'Getting started');
      mocks.retrieveSupportChunks.mockReturnValue({
        chunks: [
          { ...summary, chunk: { ...summary.chunk, origin: 'static-data', category: 'product' } },
          article('byok', 'Bring your own key'),
        ],
        passedFloor: true,
      });

      const response = await GET(request(`q=upgrade&${marker}`) as never);
      const body = await response.json();

      expect(body.results.map((result: { docId: string }) => result.docId)).toEqual(['byok']);
    });

    it('lists only articles the help index on the phone lists, over the real corpus', async () => {
      const corpus = await vi.importActual<ScanModule0>('@/lib/support/agent/corpus');
      const retrieve = await vi.importActual<RetrieveModule>(
        '@/lib/support/agent/retrieval/retrieve',
      );
      mocks.getSupportCorpus.mockImplementation(corpus.getSupportCorpus);
      mocks.retrieveSupportChunks.mockImplementation(retrieve.retrieveSupportChunks);
      const listedOnPhone = new Set(
        supportCollectionIndex()
          .collections.filter((collection) => collection.id !== PURCHASE_HELP_CATEGORY)
          .flatMap((collection) => collection.articles.map((entry) => entry.docId)),
      );
      const docIds = async (query: string) => {
        const response = await GET(request(`q=${query}&limit=12`) as never);
        const body = await response.json();
        return body.results.map((result: { docId: string }) => result.docId) as string[];
      };

      for (const query of ['upgrade', 'pricing', 'subscription', 'billing']) {
        expect((await docIds(query)).some((docId) => !listedOnPhone.has(docId))).toBe(true);
        const fromPhone = await docIds(`${query}&${marker}`);
        expect(fromPhone.filter((docId) => !listedOnPhone.has(docId))).toEqual([]);
      }
    });

    it('answers an honest empty list when only purchase articles matched', async () => {
      mocks.retrieveSupportChunks.mockReturnValue({
        chunks: [article('plans-and-invoices', 'Plans and invoices', PURCHASE_HELP_CATEGORY)],
        passedFloor: true,
      });

      const response = await GET(request(`q=upgrade&${marker}`) as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.corpus).toBe('available');
      expect(body.results).toEqual([]);
    });

    it('keeps purchase articles for every other reader', async () => {
      mocks.retrieveSupportChunks.mockReturnValue(purchaseAndProductHits());

      const response = await GET(request('q=upgrade') as never);
      const body = await response.json();

      expect(body.results.map((result: { docId: string }) => result.docId)).toEqual([
        'plans-and-invoices',
        'byok',
      ]);
    });

    it('ignores a marker value that is not the phone', async () => {
      mocks.retrieveSupportChunks.mockReturnValue(purchaseAndProductHits());

      const response = await GET(request(`q=upgrade&${EMBEDDED_PAGE_PARAM}=web`) as never);
      const body = await response.json();

      expect(body.results).toHaveLength(2);
    });
  });

  it('is cacheable, because every answer comes from already-public pages', async () => {
    const response = await GET(request('q=pricing') as never);
    expect(response.headers.get('cache-control')).toContain('public');
  });
});
