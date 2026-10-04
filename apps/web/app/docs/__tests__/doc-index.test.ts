import { describe, expect, it } from 'vitest';

import { isProductPath } from '@agiworkforce/types/product-routes';

import { getHelpArticle } from '@/lib/support/help-articles';
import { helpArticlePath } from '@/lib/support/help-paths';

import { supportCollectionIndex } from '../../help/collections';
import { documentationIndex } from '../doc-index';

describe('documentation index', () => {
  const index = documentationIndex();

  it('lists every help-centre document exactly once', () => {
    const ids = index.groups.flatMap((group) => group.entries.map((entry) => entry.docId));
    expect(ids.length).toBe(index.documentCount);
    expect(new Set(ids).size).toBe(ids.length);
    expect(index.documentCount).toBeGreaterThan(0);
  });

  it('carries applicability and an update date on every row', () => {
    for (const group of index.groups) {
      for (const entry of group.entries) {
        expect(entry.metadata, entry.docId).not.toBeNull();
        expect(entry.updated, entry.docId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('links every row to its own help article', () => {
    for (const group of index.groups) {
      for (const entry of group.entries) {
        expect(entry.href, entry.docId).toBe(helpArticlePath(entry.docId));
        expect(getHelpArticle(entry.docId)?.title, entry.docId).toBe(entry.title);
      }
    }
  });

  it('never links a row to the index itself or a signed-in route', () => {
    const hrefs = index.groups.flatMap((group) => group.entries.map((entry) => entry.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href).not.toBe('/docs');
      expect(isProductPath(href), href).toBe(false);
    }
  });

  it('matches the help centre index document for document', () => {
    const docsHrefs = new Map(
      index.groups.flatMap((group) => group.entries.map((entry) => [entry.docId, entry.href])),
    );
    const helpHrefs = new Map(
      supportCollectionIndex().collections.flatMap((collection) =>
        collection.articles.map((article) => [article.docId, article.href]),
      ),
    );
    expect(docsHrefs).toEqual(helpHrefs);
  });

  it('reports the newest update date across the whole index', () => {
    const dates = index.groups.flatMap((group) => group.entries.map((entry) => entry.updated));
    expect(index.newestUpdate).toBe([...dates].sort().at(-1));
  });
});
