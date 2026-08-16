
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_AUTHORITATIVE_PATHS,
  AUTHORITATIVE_LINKS,
  STATIC_DATA_CITATION_PATHS,
  authoritativeCitations,
} from '../policy/authoritative-links';
import { SUPPORT_ABSTAIN_CATEGORIES } from '../policy/hard-abstain';
import { getSupportCorpus } from '../corpus';
import { SITE_URL } from '@/lib/seo/site';

const APP_DIR = join(__dirname, '..', '..', '..', '..', 'app');

function pageExists(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return existsSync(join(APP_DIR, ...segments, 'page.tsx'));
}

describe('authoritative links', () => {
  it('resolves the app directory (guards the test itself against a bad path)', () => {
    expect(existsSync(join(APP_DIR, 'page.tsx'))).toBe(true);
    expect(pageExists('/definitely-not-a-real-route')).toBe(false);
  });

  it.each([...ALL_AUTHORITATIVE_PATHS])('%s resolves to a real page.tsx', (path) => {
    expect(pageExists(path)).toBe(true);
  });

  it.each([...STATIC_DATA_CITATION_PATHS])(
    '%s (static-data citation target) resolves to a real page.tsx',
    (path) => {
      expect(pageExists(path)).toBe(true);
    },
  );

  it('every corpus document path resolves to a real page.tsx', () => {
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;
    for (const path of new Set(corpus.chunks.map((chunk) => chunk.path))) {
      expect(pageExists(path), `corpus path ${path}`).toBe(true);
    }
  });

  it('covers every hard-abstain category with at least two links', () => {
    for (const category of SUPPORT_ABSTAIN_CATEGORIES) {
      expect(AUTHORITATIVE_LINKS[category].length).toBeGreaterThanOrEqual(2);
      const citations = authoritativeCitations(category);
      expect(citations.length).toBe(AUTHORITATIVE_LINKS[category].length);
      for (const citation of citations) {
        expect(citation.url.startsWith(`${SITE_URL}/`)).toBe(true);
        expect(citation.title.length).toBeGreaterThan(0);
        expect(citation.snippet.length).toBeGreaterThan(0);
      }
    }
  });
});
