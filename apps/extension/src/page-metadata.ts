import { logger } from './utils';

export interface PageMetadata {
  url: string;
  title: string;
  description: string;
  language: string;
  canonical: string | null;
  author: string | null;
  keywords: string[];
  favicon: string | null;
  mainHeading: string | null;
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  jsonLd: unknown[];
  schemaTypes: string[];
}

function extractJsonLd(): unknown[] {
  const results: unknown[] = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;

    try {
      const parsed: unknown = JSON.parse(text);
      results.push(parsed);
    } catch (e) {
      logger.warn('Failed to parse JSON-LD block', e);
    }
  }

  return results;
}

function extractOpenGraph(): Record<string, string> {
  const og: Record<string, string> = {};
  const metas = document.querySelectorAll('meta[property^="og:"]');

  for (const meta of metas) {
    const property = meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (property && content) {
      // Strip the "og:" prefix for cleaner keys
      og[property.slice(3)] = content;
    }
  }

  return og;
}

function extractTwitterCard(): Record<string, string> {
  const twitter: Record<string, string> = {};
  const metas = document.querySelectorAll('meta[name^="twitter:"]');

  for (const meta of metas) {
    const name = meta.getAttribute('name');
    const content = meta.getAttribute('content');
    if (name && content) {
      // Strip the "twitter:" prefix for cleaner keys
      twitter[name.slice(8)] = content;
    }
  }

  return twitter;
}

function getMetaContent(name: string): string | null {
  // Try name attribute first, then property attribute
  const meta =
    document.querySelector(`meta[name="${CSS.escape(name)}"]`) ??
    document.querySelector(`meta[property="${CSS.escape(name)}"]`);

  return meta?.getAttribute('content') ?? null;
}

function getCanonicalUrl(): string | null {
  const link = document.querySelector('link[rel="canonical"]');
  return link?.getAttribute('href') ?? null;
}

function getLanguage(): string {
  return document.documentElement.lang || 'en';
}

function getFavicon(): string | null {
  // Check for explicit favicon link tags (most specific first)
  const selectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
  ];

  for (const selector of selectors) {
    const link = document.querySelector(selector);
    const href = link?.getAttribute('href');
    if (href) {
      // Resolve relative URLs to absolute
      try {
        return new URL(href, document.baseURI).href;
      } catch {
        return href;
      }
    }
  }

  // Fallback: /favicon.ico at the origin
  try {
    return new URL('/favicon.ico', window.location.origin).href;
  } catch {
    return null;
  }
}

function getMainHeading(): string | null {
  const h1 = document.querySelector('h1');
  return h1?.textContent?.trim() ?? null;
}

function extractSchemaTypes(): string[] {
  const types = new Set<string>();

  // Microdata: elements with itemscope + itemtype
  const itemScoped = document.querySelectorAll('[itemscope][itemtype]');
  for (const el of itemScoped) {
    const itemType = el.getAttribute('itemtype');
    if (!itemType) continue;

    // itemtype is a URL like "https://schema.org/Article"
    // Extract the type name from the end
    const typeName = itemType.split('/').pop();
    if (typeName) {
      types.add(typeName);
    }
  }

  // Also extract @type from JSON-LD (already parsed above, but we
  // call this separately so callers can get types without full JSON-LD)
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;

    try {
      const parsed: unknown = JSON.parse(text);
      collectJsonLdTypes(parsed, types);
    } catch {
      // Already logged in extractJsonLd
    }
  }

  return Array.from(types);
}

function collectJsonLdTypes(data: unknown, types: Set<string>): void {
  if (Array.isArray(data)) {
    for (const item of data) {
      collectJsonLdTypes(item, types);
    }
    return;
  }

  if (data !== null && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const typeValue = record['@type'];

    if (typeof typeValue === 'string') {
      types.add(typeValue);
    } else if (Array.isArray(typeValue)) {
      for (const t of typeValue) {
        if (typeof t === 'string') {
          types.add(t);
        }
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) {
        collectJsonLdTypes(value, types);
      }
    }
  }
}

export function extractPageMetadata(): PageMetadata {
  try {
    const description = getMetaContent('description') ?? '';
    const keywordsRaw = getMetaContent('keywords') ?? '';
    const keywords = keywordsRaw
      ? keywordsRaw
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    return {
      url: window.location.href,
      title: document.title,
      description,
      language: getLanguage(),
      canonical: getCanonicalUrl(),
      author: getMetaContent('author'),
      keywords,
      favicon: getFavicon(),
      mainHeading: getMainHeading(),
      openGraph: extractOpenGraph(),
      twitterCard: extractTwitterCard(),
      jsonLd: extractJsonLd(),
      schemaTypes: extractSchemaTypes(),
    };
  } catch (e) {
    logger.error('Failed to extract page metadata', e);

    // Return a safe fallback so callers always get a valid object
    return {
      url: window.location.href,
      title: document.title,
      description: '',
      language: 'en',
      canonical: null,
      author: null,
      keywords: [],
      favicon: null,
      mainHeading: null,
      openGraph: {},
      twitterCard: {},
      jsonLd: [],
      schemaTypes: [],
    };
  }
}
