import { describe, expect, it } from 'vitest';

import {
  PUBLIC_SOURCE_TYPES,
  citationIsReproducible,
  citationSourceType,
  isPublicSourceType,
  type Citation,
  type PublicSourceLocator,
  type PublicSourceType,
} from '../research';

function cite(locator?: PublicSourceLocator, url = 'https://example.test/a'): Citation {
  return {
    id: 'c1',
    title: 'A claim somebody made',
    url,
    accessedAt: '2026-09-21T00:00:00.000Z',
    ...(locator === undefined ? {} : { locator }),
  };
}

const COMPLETE: Readonly<Record<PublicSourceType, PublicSourceLocator>> = {
  web_page: { type: 'web_page', siteName: 'Example' },
  news_article: {
    type: 'news_article',
    publication: 'The Example',
    publishedDate: '2026-09-01',
    section: 'Business',
  },
  academic_paper: { type: 'academic_paper', doi: '10.1000/example', peerReviewed: true },
  pdf_document: { type: 'pdf_document', page: 34, totalPages: 120 },
};

describe('a source keeps what it is, not only where it was found', () => {
  it('carries a locator variant for every type it names', () => {
    for (const type of PUBLIC_SOURCE_TYPES) {
      expect(isPublicSourceType(type)).toBe(true);
      const locator = COMPLETE[type];
      expect(locator, type).toBeDefined();
      expect(locator?.type, type).toBe(type);
      expect(citationSourceType(cite(locator)), type).toBe(type);
    }
    expect(isPublicSourceType('podcast')).toBe(false);
  });

  it('tells an unclassified source apart from one classified as a web page', () => {
    expect(citationSourceType(cite())).toBeNull();
    expect(citationSourceType(cite(COMPLETE.web_page))).toBe('web_page');
  });

  it('calls every fully located source reproducible', () => {
    for (const type of PUBLIC_SOURCE_TYPES) {
      expect(citationIsReproducible(cite(COMPLETE[type])), type).toBe(true);
    }
  });

  it('refuses a paper identified only by a link that can move', () => {
    expect(citationIsReproducible(cite({ type: 'academic_paper', venue: 'A conference' }))).toBe(
      false,
    );
    expect(citationIsReproducible(cite({ type: 'academic_paper', arxivId: '2609.00001' }))).toBe(
      true,
    );
  });

  it('refuses a news claim with no dateline to check it against', () => {
    expect(
      citationIsReproducible(
        cite({ type: 'news_article', publication: 'The Example', publishedDate: '' }),
      ),
    ).toBe(false);
  });

  it('refuses a citation into a document that does not say which page', () => {
    expect(citationIsReproducible(cite({ type: 'pdf_document', totalPages: 120 }))).toBe(false);
    expect(citationIsReproducible(cite({ type: 'pdf_document', page: 0 }))).toBe(false);
    expect(citationIsReproducible(cite({ type: 'pdf_document', page: 1 }))).toBe(true);
  });

  it('still judges an unclassified citation by the only thing it has', () => {
    expect(citationIsReproducible(cite(undefined, 'https://example.test/a'))).toBe(true);
    expect(citationIsReproducible(cite(undefined, ''))).toBe(false);
  });
});
