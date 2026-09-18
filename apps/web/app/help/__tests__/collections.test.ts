import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { supportCollectionIndex } from '../collections';

const PAGE = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

describe('the /help collection index is derived from the support corpus', () => {
  it('lists every corpus document exactly once, under its own category', () => {
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;

    const documents = new Map(
      corpus.chunks
        .filter((chunk) => chunk.origin === 'markdown')
        .map((chunk) => [chunk.docId, chunk]),
    );
    const { collections, articleCount } = supportCollectionIndex();

    expect(articleCount).toBe(documents.size);
    expect(collections.length).toBeGreaterThan(0);

    const listed = collections.flatMap((collection) =>
      collection.articles.map((article) => ({ collection, article })),
    );
    expect(listed).toHaveLength(documents.size);

    for (const { collection, article } of listed) {
      const chunk = documents.get(article.docId);
      expect(chunk, `${article.docId} is not a corpus document`).toBeDefined();
      expect(article.title).toBe(chunk?.docTitle);
      expect(article.href).toBe(chunk?.path);
      expect(collection.id).toBe(chunk?.category);
    }
  });

  it('orders collections and their articles so the index reads the same every build', () => {
    const { collections } = supportCollectionIndex();

    expect(collections.map((collection) => collection.label)).toEqual(
      [...collections.map((collection) => collection.label)].sort((a, b) => a.localeCompare(b)),
    );
    for (const collection of collections) {
      const titles = collection.articles.map((article) => article.title);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
      expect(collection.label[0]).toBe(collection.label[0]?.toUpperCase());
    }
  });

  it('renders the index instead of a hand-kept link list', () => {
    expect(PAGE).toContain('supportCollectionIndex()');
    for (const hardcoded of ["href: '/download'", "href: '/byok'", "href: '/local'"]) {
      expect(PAGE.includes(hardcoded), `/help is back to a hardcoded ${hardcoded}`).toBe(false);
    }
  });
});
