
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '@/lib/seo/site';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import { getSupportCorpus } from '../corpus';
import { MIN_ABSOLUTE_SCORE, evaluateRelevanceFloor } from '../policy/relevance-floor';
import { buildBm25Index, scoreBm25 } from '../retrieval/bm25';
import { tokenize } from '../retrieval/tokenize';

describe('support corpus', () => {
  it('loads and contains only public paths', () => {
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;
    expect(corpus.chunks.length).toBeGreaterThan(20);
    for (const chunk of corpus.chunks) {
      expect(chunk.path.startsWith('/')).toBe(true);
      expect(chunk.path).not.toMatch(/^\/(settings|admin|api|dev|debug|user|auth)(\/|$)/);
    }
  });

  it('interpolates marketing fact tokens instead of leaving placeholders', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    for (const chunk of corpus.chunks) {
      expect(chunk.text).not.toMatch(/\{\{/);
    }
    const providers = corpus.chunks.find((chunk) => chunk.docId === 'providers-and-models');
    expect(providers).toBeDefined();
    const joined = corpus.chunks
      .filter((chunk) => chunk.docId === 'providers-and-models')
      .map((chunk) => chunk.text)
      .join('\n');
    expect(joined).toContain('10+');
  });
});

describe('retrieveSupportChunks', () => {
  it('answers a known BYOK question with a citation to the real /byok page', () => {
    const result = retrieveSupportChunks('how do I add my Anthropic API key');

    expect(result.passedFloor).toBe(true);
    expect(result.topScore).toBeGreaterThanOrEqual(MIN_ABSOLUTE_SCORE);
    expect(result.chunks.length).toBeGreaterThan(0);

    const urls = result.chunks.map((item) => item.citation.url);
    expect(urls).toContain(`${SITE_URL}/byok`);

    const byokChunk = result.chunks.find((item) => item.chunk.docId === 'byok-provider-keys');
    expect(byokChunk).toBeDefined();
    expect(byokChunk?.citation.snippet.length).toBeGreaterThan(0);
    expect(byokChunk?.citation.chunkId).toBe(byokChunk?.chunk.id);
  });

  it('retrieves the local-mode document for an offline question', () => {
    const result = retrieveSupportChunks('can I run models offline with ollama');
    expect(result.passedFloor).toBe(true);
    expect(result.chunks.map((item) => item.chunk.docId)).toContain('local-mode');
  });

  it('surfaces the published static-data FAQs as retrievable sources', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    const staticIds = corpus.chunks
      .filter((chunk) => chunk.origin === 'static-data')
      .map((chunk) => chunk.id);
    expect(staticIds).toHaveLength(9);
    expect(staticIds).toContain('static-faq:faq-001');
    expect(staticIds).toContain('static-article:article-002');
  });

  it('caps how many chunks a single document can contribute', () => {
    const result = retrieveSupportChunks('provider api key key key provider provider');
    const perDocument = new Map<string, number>();
    for (const item of result.chunks) {
      perDocument.set(item.chunk.docId, (perDocument.get(item.chunk.docId) ?? 0) + 1);
    }
    for (const count of perDocument.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('builds every citation URL from SITE_URL and never from document text', () => {
    const result = retrieveSupportChunks('how do I connect an MCP connector');
    expect(result.chunks.length).toBeGreaterThan(0);
    for (const item of result.chunks) {
      expect(item.citation.url.startsWith(`${SITE_URL}/`)).toBe(true);
      expect(new URL(item.citation.url).origin).toBe(new URL(SITE_URL).origin);
    }
  });
});

describe('bm25 (synthetic corpus)', () => {
  it('boosts heading and tag terms over body terms', () => {
    const index = buildBm25Index([
      {
        id: 'heading-hit',
        text: 'unrelated filler prose about nothing at all',
        boosted: 'kumquat',
      },
      {
        id: 'body-hit',
        text: 'kumquat appears once here inside a long body of unrelated filler prose',
        boosted: 'unrelated heading',
      },
    ]);
    const hits = scoreBm25(index, 'kumquat');
    expect(hits[0]?.id).toBe('heading-hit');
  });

  it('returns no hits when no query term appears', () => {
    const index = buildBm25Index([{ id: 'a', text: 'alpha beta', boosted: 'gamma' }]);
    expect(scoreBm25(index, 'zebra xylophone')).toHaveLength(0);
  });
});

describe('relevance floor', () => {
  it('rejects a top hit below the absolute score', () => {
    const verdict = evaluateRelevanceFloor({
      topScore: MIN_ABSOLUTE_SCORE - 0.01,
      matchedTermCount: 3,
      queryTermCount: 3,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('below_score');
  });

  it('rejects a high-scoring hit that matched only one term of a long query', () => {
    const verdict = evaluateRelevanceFloor({
      topScore: 99,
      matchedTermCount: 1,
      queryTermCount: 6,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('below_coverage');
  });

  it('allows a single-term query to pass on its one term', () => {
    expect(tokenize('byok')).toEqual(['byok']);
    const verdict = evaluateRelevanceFloor({ topScore: 5, matchedTermCount: 1, queryTermCount: 1 });
    expect(verdict.passed).toBe(true);
  });
});
