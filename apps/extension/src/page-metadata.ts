import { logger } from './utils';
import { safeJsonParse, MAX_JSON_LD_BYTES } from './background/policy';

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
    // M-03 audit 2026-05-19: cap per-script-block size so a hostile page
    // with multi-MB JSON-LD cannot stall the parser.
    const parsed = safeJsonParse<unknown>(text, MAX_JSON_LD_BYTES);
    if (parsed === undefined) {
      logger.warn('Skipped JSON-LD block (oversize or unparseable)');
      continue;
    }
    results.push(parsed);
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
  // call this separately so callers can get types without full JSON-LD).
  // M-03 audit 2026-05-19: same size cap as extractJsonLd.
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;
    const parsed = safeJsonParse<unknown>(text, MAX_JSON_LD_BYTES);
    if (parsed !== undefined) {
      collectJsonLdTypes(parsed, types);
    }
  }

  return Array.from(types);
}

// SECURITY (audit batch-221 [MEDIUM] resource exhaustion, 2026-06-13): cap
// recursion depth to match collectSchemaTypes in nlweb.ts and bound work on
// hostile/deeply nested JSON-LD.
const MAX_JSONLD_RECURSION_DEPTH = 10;

function collectJsonLdTypes(data: unknown, types: Set<string>, depth = 0): void {
  if (depth > MAX_JSONLD_RECURSION_DEPTH) return;

  if (Array.isArray(data)) {
    for (const item of data) {
      collectJsonLdTypes(item, types, depth + 1);
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
        collectJsonLdTypes(value, types, depth + 1);
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
