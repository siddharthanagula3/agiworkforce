/**
 * Tests for page metadata extraction (page-metadata.ts).
 *
 * Uses jsdom to build minimal DOM fixtures and verifies that
 * extractPageMetadata() returns the correct structured data.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock the logger so warn/error calls don't pollute test output
vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Polyfill CSS.escape for jsdom (not natively supported)
if (typeof CSS === 'undefined' || !CSS.escape) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).CSS = {
    escape: (value: string) => value.replace(/([^\w-])/g, '\\$1'),
  };
}

import { extractPageMetadata, type PageMetadata } from '../src/page-metadata';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Reset the document to a clean state between tests. */
function resetDocument(): void {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = '';
  document.documentElement.lang = '';
}

function addMeta(attrs: Record<string, string>): void {
  const meta = document.createElement('meta');
  for (const [key, value] of Object.entries(attrs)) {
    meta.setAttribute(key, value);
  }
  document.head.appendChild(meta);
}

function addLink(attrs: Record<string, string>): void {
  const link = document.createElement('link');
  for (const [key, value] of Object.entries(attrs)) {
    link.setAttribute(key, value);
  }
  document.head.appendChild(link);
}

function addJsonLd(data: unknown): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function addJsonLdRaw(text: string): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = text;
  document.head.appendChild(script);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('extractPageMetadata', () => {
  beforeEach(() => {
    resetDocument();
  });

  // 1. Basic page with title and description meta tag
  describe('basic page with title and description', () => {
    it('extracts title and description', () => {
      document.title = 'My Test Page';
      addMeta({ name: 'description', content: 'A page about testing' });

      const result = extractPageMetadata();

      expect(result.title).toBe('My Test Page');
      expect(result.description).toBe('A page about testing');
    });

    it('returns the current page URL', () => {
      const result = extractPageMetadata();

      // jsdom url is configured in vitest.config.ts
      expect(result.url).toBe(window.location.href);
      expect(result.url).toContain('https://');
    });

    it('extracts the main h1 heading', () => {
      document.body.innerHTML = '<h1>Welcome to the Site</h1>';

      const result = extractPageMetadata();

      expect(result.mainHeading).toBe('Welcome to the Site');
    });

    it('trims whitespace from h1 heading', () => {
      document.body.innerHTML = '<h1>  Spaced Title  </h1>';

      const result = extractPageMetadata();

      expect(result.mainHeading).toBe('Spaced Title');
    });
  });

  // 2. Open Graph tags extraction
  describe('Open Graph tags', () => {
    it('extracts og: meta tags and strips prefix', () => {
      addMeta({ property: 'og:title', content: 'OG Title' });
      addMeta({ property: 'og:description', content: 'OG Description' });
      addMeta({ property: 'og:image', content: 'https://example.com/image.png' });
      addMeta({ property: 'og:url', content: 'https://example.com/page' });
      addMeta({ property: 'og:type', content: 'article' });

      const result = extractPageMetadata();

      expect(result.openGraph).toEqual({
        title: 'OG Title',
        description: 'OG Description',
        image: 'https://example.com/image.png',
        url: 'https://example.com/page',
        type: 'article',
      });
    });

    it('returns empty object when no OG tags present', () => {
      const result = extractPageMetadata();

      expect(result.openGraph).toEqual({});
    });

    it('ignores og tags with empty content', () => {
      addMeta({ property: 'og:title', content: '' });

      const result = extractPageMetadata();

      // Empty content is falsy, so the implementation skips it
      expect(result.openGraph).toEqual({});
    });
  });

  // 3. Twitter Card tags extraction
  describe('Twitter Card tags', () => {
    it('extracts twitter: meta tags and strips prefix', () => {
      addMeta({ name: 'twitter:card', content: 'summary_large_image' });
      addMeta({ name: 'twitter:site', content: '@example' });
      addMeta({ name: 'twitter:title', content: 'Twitter Title' });
      addMeta({ name: 'twitter:description', content: 'Twitter Desc' });
      addMeta({ name: 'twitter:image', content: 'https://example.com/tw.png' });

      const result = extractPageMetadata();

      expect(result.twitterCard).toEqual({
        card: 'summary_large_image',
        site: '@example',
        title: 'Twitter Title',
        description: 'Twitter Desc',
        image: 'https://example.com/tw.png',
      });
    });

    it('returns empty object when no Twitter tags present', () => {
      const result = extractPageMetadata();

      expect(result.twitterCard).toEqual({});
    });
  });

  // 4. JSON-LD structured data parsing
  describe('JSON-LD structured data', () => {
    it('parses a single JSON-LD block', () => {
      const data = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Test Article',
        author: { '@type': 'Person', name: 'Jane Doe' },
      };
      addJsonLd(data);

      const result = extractPageMetadata();

      expect(result.jsonLd).toHaveLength(1);
      expect(result.jsonLd[0]).toEqual(data);
    });

    it('extracts schema types from JSON-LD @type fields', () => {
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Test',
      });

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Article');
    });

    it('handles nested @type in JSON-LD', () => {
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        author: {
          '@type': 'Person',
          name: 'Jane',
        },
      });

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Article');
      expect(result.schemaTypes).toContain('Person');
    });

    it('handles array @type values', () => {
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': ['Article', 'BlogPosting'],
        headline: 'Test',
      });

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Article');
      expect(result.schemaTypes).toContain('BlogPosting');
    });
  });

  // 5. Multiple JSON-LD blocks
  describe('multiple JSON-LD blocks', () => {
    it('collects all JSON-LD blocks into the array', () => {
      addJsonLd({ '@type': 'Organization', name: 'Acme Corp' });
      addJsonLd({ '@type': 'WebSite', name: 'Acme Website' });

      const result = extractPageMetadata();

      expect(result.jsonLd).toHaveLength(2);
      expect(result.jsonLd[0]).toEqual({ '@type': 'Organization', name: 'Acme Corp' });
      expect(result.jsonLd[1]).toEqual({ '@type': 'WebSite', name: 'Acme Website' });
    });

    it('collects schema types from all JSON-LD blocks', () => {
      addJsonLd({ '@type': 'Organization', name: 'Acme' });
      addJsonLd({ '@type': 'WebSite', name: 'Site' });
      addJsonLd({ '@type': 'BreadcrumbList', itemListElement: [] });

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Organization');
      expect(result.schemaTypes).toContain('WebSite');
      expect(result.schemaTypes).toContain('BreadcrumbList');
    });

    it('deduplicates schema types across blocks', () => {
      addJsonLd({ '@type': 'Article', headline: 'First' });
      addJsonLd({ '@type': 'Article', headline: 'Second' });

      const result = extractPageMetadata();

      const articleCount = result.schemaTypes.filter((t) => t === 'Article').length;
      expect(articleCount).toBe(1);
    });
  });

  // 6. Invalid JSON-LD (should not throw)
  describe('invalid JSON-LD', () => {
    it('does not throw on malformed JSON', () => {
      addJsonLdRaw('{ this is not valid json }}}');

      expect(() => extractPageMetadata()).not.toThrow();
    });

    it('returns empty jsonLd array when all blocks are invalid', () => {
      addJsonLdRaw('not json');
      addJsonLdRaw('{{{');

      const result = extractPageMetadata();

      expect(result.jsonLd).toEqual([]);
    });

    it('skips invalid blocks but keeps valid ones', () => {
      addJsonLd({ '@type': 'Article', headline: 'Valid' });
      addJsonLdRaw('not json');
      addJsonLd({ '@type': 'Person', name: 'Alice' });

      const result = extractPageMetadata();

      expect(result.jsonLd).toHaveLength(2);
      expect(result.schemaTypes).toContain('Article');
      expect(result.schemaTypes).toContain('Person');
    });

    it('handles empty script tags gracefully', () => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      // No textContent set
      document.head.appendChild(script);

      expect(() => extractPageMetadata()).not.toThrow();
      const result = extractPageMetadata();
      expect(result.jsonLd).toEqual([]);
    });
  });

  // 7. Canonical URL extraction
  describe('canonical URL', () => {
    it('extracts canonical link', () => {
      addLink({ rel: 'canonical', href: 'https://example.com/canonical-page' });

      const result = extractPageMetadata();

      expect(result.canonical).toBe('https://example.com/canonical-page');
    });

    it('returns null when no canonical link exists', () => {
      const result = extractPageMetadata();

      expect(result.canonical).toBeNull();
    });
  });

  // 8. Author, keywords, language extraction
  describe('author, keywords, and language', () => {
    it('extracts author meta tag', () => {
      addMeta({ name: 'author', content: 'John Smith' });

      const result = extractPageMetadata();

      expect(result.author).toBe('John Smith');
    });

    it('returns null when no author meta tag exists', () => {
      const result = extractPageMetadata();

      expect(result.author).toBeNull();
    });

    it('extracts and splits keywords into an array', () => {
      addMeta({ name: 'keywords', content: 'typescript, testing, vitest, jsdom' });

      const result = extractPageMetadata();

      expect(result.keywords).toEqual(['typescript', 'testing', 'vitest', 'jsdom']);
    });

    it('trims whitespace from individual keywords', () => {
      addMeta({ name: 'keywords', content: '  foo ,  bar  ,baz' });

      const result = extractPageMetadata();

      expect(result.keywords).toEqual(['foo', 'bar', 'baz']);
    });

    it('returns empty array when no keywords meta tag exists', () => {
      const result = extractPageMetadata();

      expect(result.keywords).toEqual([]);
    });

    it('filters out empty keyword entries', () => {
      addMeta({ name: 'keywords', content: 'a,,b, ,c' });

      const result = extractPageMetadata();

      // Empty strings and whitespace-only entries should be filtered
      expect(result.keywords).toEqual(['a', 'b', 'c']);
    });

    it('extracts language from html lang attribute', () => {
      document.documentElement.lang = 'fr';

      const result = extractPageMetadata();

      expect(result.language).toBe('fr');
    });

    it('defaults language to "en" when lang attribute is empty', () => {
      document.documentElement.lang = '';

      const result = extractPageMetadata();

      expect(result.language).toBe('en');
    });
  });

  // 9. Empty page (graceful defaults)
  describe('empty page (graceful defaults)', () => {
    it('returns valid PageMetadata with sensible defaults', () => {
      const result = extractPageMetadata();

      expect(result).toMatchObject<Partial<PageMetadata>>({
        title: '',
        description: '',
        language: 'en',
        canonical: null,
        author: null,
        keywords: [],
        mainHeading: null,
        openGraph: {},
        twitterCard: {},
        jsonLd: [],
        schemaTypes: [],
      });
      // url and favicon will have values from jsdom defaults
      expect(typeof result.url).toBe('string');
      expect(result.url.length).toBeGreaterThan(0);
    });

    it('favicon falls back to /favicon.ico', () => {
      // No link[rel="icon"] tags in head
      const result = extractPageMetadata();

      // The implementation falls back to origin + /favicon.ico
      expect(result.favicon).toContain('/favicon.ico');
    });

    it('returns all required PageMetadata keys', () => {
      const result = extractPageMetadata();

      const requiredKeys: (keyof PageMetadata)[] = [
        'url',
        'title',
        'description',
        'language',
        'canonical',
        'author',
        'keywords',
        'favicon',
        'mainHeading',
        'openGraph',
        'twitterCard',
        'jsonLd',
        'schemaTypes',
      ];

      for (const key of requiredKeys) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  // Additional edge cases
  describe('favicon extraction', () => {
    it('prefers link[rel="icon"] over shortcut icon', () => {
      addLink({ rel: 'icon', href: '/icon.png' });
      addLink({ rel: 'shortcut icon', href: '/shortcut.ico' });

      const result = extractPageMetadata();

      expect(result.favicon).toContain('/icon.png');
    });

    it('resolves relative favicon URLs to absolute', () => {
      addLink({ rel: 'icon', href: '/assets/icon.svg' });

      const result = extractPageMetadata();

      // Should be an absolute URL
      expect(result.favicon).toMatch(/^https?:\/\//);
      expect(result.favicon).toContain('/assets/icon.svg');
    });
  });

  describe('Schema.org microdata', () => {
    it('extracts types from itemscope + itemtype attributes', () => {
      document.body.innerHTML =
        '<div itemscope itemtype="https://schema.org/Product">' +
        '<span itemprop="name">Widget</span>' +
        '</div>';

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Product');
    });

    it('combines microdata and JSON-LD schema types', () => {
      document.body.innerHTML = '<div itemscope itemtype="https://schema.org/Product"></div>';
      addJsonLd({ '@type': 'Organization', name: 'Acme' });

      const result = extractPageMetadata();

      expect(result.schemaTypes).toContain('Product');
      expect(result.schemaTypes).toContain('Organization');
    });
  });
});
