import { describe, expect, it, vi } from 'vitest';
import * as corpus from '../agent/corpus';
import { getHelpArticle, helpResultPath } from '../help-articles';

describe('public help articles', () => {
  it('preserves every ordered section of each validated markdown document', () => {
    const loaded = corpus.getSupportCorpus();
    expect(loaded.available).toBe(true);
    if (!loaded.available) throw new Error('Expected the real support corpus');
    const chunks = loaded.chunks.filter((chunk) => chunk.origin === 'markdown');
    for (const docId of new Set(chunks.map((chunk) => chunk.docId))) {
      const sections = chunks.filter((chunk) => chunk.docId === docId);
      const article = getHelpArticle(docId);
      expect(article?.sections).toEqual(sections);
      expect(article?.title).toBe(sections[0]?.docTitle);
      expect(article?.relatedPath).toBe(sections[0]?.path);
      expect(article?.sections.every((section) => !section.text.includes('{{'))).toBe(true);
    }
  });

  it('does not turn static facts or unknown paths into markdown articles', () => {
    expect(getHelpArticle('../private')).toBeNull();
    expect(getHelpArticle('nonexistent-help-article')).toBeNull();
    expect(helpResultPath({ origin: 'static-data', docId: 'plans', path: '/pricing' })).toBe(
      '/pricing',
    );
  });

  it('distinguishes an unavailable corpus from a missing article', () => {
    const spy = vi
      .spyOn(corpus, 'getSupportCorpus')
      .mockReturnValueOnce({ available: false, reason: 'invalid fixture' });
    try {
      expect(() => getHelpArticle('usage-and-credits')).toThrow(corpus.CorpusUnavailableError);
    } finally {
      spy.mockRestore();
    }
  });
});
