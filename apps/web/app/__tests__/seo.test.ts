import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { buildMetadata } from '@/lib/seo/metadata';
import { OG_IMAGE, SITE_URL } from '@/lib/seo/site';
import {
  breadcrumbSchema,
  faqPageSchema,
  organizationSchema,
  softwareApplicationSchema,
  webSiteSchema,
} from '@/lib/seo/structured-data';
import {
  RELEASED_SURFACES,
  SURFACE_NAMES,
  SURFACE_PLATFORMS,
  UNRELEASED_SURFACES,
  releasedPlatforms,
  surfaceAvailabilitySummary,
} from '@/lib/surface-status';

vi.mock('@/features/marketing/components/MarketingLanding', () => ({
  MarketingLanding: () => null,
}));
vi.mock('@/lib/server/free-media-offer-reader', () => ({
  readFreeMediaOfferForRender: async () => null,
}));

function og(meta: ReturnType<typeof buildMetadata>) {
  return meta.openGraph as {
    title?: string;
    description?: string;
    url?: string;
    images?: { url: string; width?: number; height?: number }[];
  };
}

describe('buildMetadata', () => {
  const meta = buildMetadata({
    title: 'BYOK: Bring Your Own Keys to the CLI',
    description: 'Bring your own provider API keys to the AGI CLI.',
    path: '/byok',
  });

  it('sets a page-specific canonical', () => {
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/byok`);
  });

  it('emits a complete, page-specific Open Graph block (not the home card)', () => {
    expect(og(meta).title).toBe('BYOK: Bring Your Own Keys to the CLI');
    expect(og(meta).title).not.toBe('AGI | One AI workspace across models and tools.');
    expect(og(meta).url).toBe(`${SITE_URL}/byok`);
  });

  it('uses the dynamic OG card at standard 1200x630 dimensions', () => {
    const image = og(meta).images?.[0];
    expect(image?.url).toBe(OG_IMAGE.url);
    expect(image?.width).toBe(1200);
    expect(image?.height).toBe(630);
  });

  it('emits a Twitter summary_large_image card mirroring the OG title', () => {
    const twitter = meta.twitter as { card?: string; title?: string };
    expect(twitter.card).toBe('summary_large_image');
    expect(twitter.title).toBe('BYOK: Bring Your Own Keys to the CLI');
  });

  it('honors ogTitle/ogDescription overrides', () => {
    const m = buildMetadata({
      title: 'Getting Started',
      description: 'desc',
      path: '/get-started',
      ogTitle: 'Start with AGI',
      ogDescription: 'Other surfaces are coming soon.',
    });
    expect(og(m).title).toBe('Start with AGI');
    expect(og(m).description).toBe('Other surfaces are coming soon.');
  });
});

describe('robots', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const agentNames = rules.flatMap((r) =>
    Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent],
  );

  const AI_BOTS = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'anthropic-ai',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'Applebot-Extended',
    'Meta-ExternalAgent',
  ];

  it.each(AI_BOTS)('allows AI answer-engine crawler %s', (bot) => {
    const rule = rules.find((r) => r.userAgent === bot);
    expect(rule, `${bot} rule missing`).toBeDefined();
    expect(rule?.allow).toBe('/');
  });

  it('blocks CCBot (Common Crawl) entirely', () => {
    const ccbot = rules.find((r) => r.userAgent === 'CCBot');
    expect(ccbot?.disallow).toBe('/');
    expect(agentNames).toContain('CCBot');
  });

  it('disallows authenticated app routes for every allowed crawler', () => {
    for (const bot of ['*', ...AI_BOTS, 'Googlebot']) {
      const rule = rules.find((r) => r.userAgent === bot);
      const disallow = (rule?.disallow ?? []) as string[];
      for (const path of [
        '/chat',
        '/settings',
        '/billing',
        '/chat/projects',
        '/chat/schedules',
        '/user',
        '/chat/customize',
      ]) {
        expect(disallow, `${bot} should disallow ${path}`).toContain(path);
      }
    }
  });

  it('lets every allowed crawler fetch the share image and nothing else under /api/', () => {
    const shareRule = rules.find((r) => Array.isArray(r.userAgent));
    const allow = (shareRule?.allow ?? []) as string[];
    const group = shareRule?.userAgent as string[];
    expect(allow).toEqual(['/api/og$', '/api/og?']);
    for (const bot of ['*', ...AI_BOTS, 'Googlebot', 'bingbot', 'Applebot']) {
      expect(group, `${bot} should get the share image allow`).toContain(bot);
    }
    expect(group).not.toContain('CCBot');

    const longestMatch = (patterns: string[], path: string) =>
      Math.max(
        0,
        ...patterns
          .filter((pattern) =>
            pattern.endsWith('$') ? path === pattern.slice(0, -1) : path.startsWith(pattern),
          )
          .map((pattern) => pattern.length),
      );
    const disallow = (rules.find((r) => r.userAgent === '*')?.disallow ?? []) as string[];
    const shareUrl = new URL(OG_IMAGE.url, SITE_URL);
    const sharePath = `${shareUrl.pathname}${shareUrl.search}`;
    expect(longestMatch(allow, sharePath)).toBeGreaterThan(longestMatch(disallow, sharePath));
    for (const blocked of ['/api/me', '/api/health', '/api/user/export', '/api/ogre']) {
      expect(longestMatch(allow, blocked), `${blocked} must stay blocked`).toBeLessThan(
        longestMatch(disallow, blocked),
      );
    }
  });

  it('points at the absolute sitemap URL', () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe('sitemap', () => {
  const entries = sitemap();
  const paths = entries.map((e) => e.url.replace(SITE_URL, '') || '/');

  it.each(['/faq', '/features/agents', '/features/tools', '/apps', '/skills', '/get-started'])(
    'includes indexable public route %s',
    (route) => {
      expect(paths).toContain(route);
    },
  );

  it('excludes authenticated app and redirect routes', () => {
    for (const excluded of ['/chat', '/settings', '/billing', '/privacy-policy', '/sign-in']) {
      expect(paths).not.toContain(excluded);
    }
  });

  it('leaves the empty blog out while it has no posts', () => {
    expect(paths).not.toContain('/blog');
  });

  it('lists the homepage at priority 1.0', () => {
    const home = entries.find((e) => e.url === SITE_URL);
    expect(home?.priority).toBe(1.0);
  });

  it('never lists a path that robots.ts disallows', () => {
    for (const disallowed of [
      '/chat',
      '/settings',
      '/billing',
      '/chat/projects',
      '/chat/schedules',
      '/user',
      '/chat/customize',
    ]) {
      expect(paths.some((p) => p === disallowed || p.startsWith(`${disallowed}/`))).toBe(false);
    }
  });
});

describe('pages without published content', () => {
  it.each(['app/blog/page.tsx', 'app/customers/page.tsx'])(
    '%s stays reachable for people but is marked noindex',
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/);
    },
  );
});

describe('homepage description', () => {
  it('states release status from the surface registry, not a surface count', async () => {
    const { metadata } = await import('@/app/page');
    const description = String(metadata.description);
    expect(description).toContain(surfaceAvailabilitySummary());
    expect(description).not.toMatch(/\bsix\b/i);
  });
});

describe('structured data', () => {
  it('WebSite schema has NO SearchAction (no public site search)', () => {
    const schema = webSiteSchema();
    expect(schema['@type']).toBe('WebSite');
    expect(schema['potentialAction']).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain('SearchAction');
  });

  it('Organization schema is well-formed', () => {
    const schema = organizationSchema();
    expect(schema['@type']).toBe('Organization');
    expect(schema['url']).toBe(SITE_URL);
  });

  it('SoftwareApplication carries no offers, rating, download or install claims', () => {
    const schema = softwareApplicationSchema();
    for (const key of ['offers', 'aggregateRating', 'review', 'downloadUrl', 'installUrl']) {
      expect(schema[key], key).toBeUndefined();
    }
  });

  it('SoftwareApplication schema is well-formed', () => {
    const schema = softwareApplicationSchema();
    expect(schema['@type']).toBe('SoftwareApplication');
  });

  it('SoftwareApplication lists only the platforms of released surfaces', () => {
    const operatingSystem = softwareApplicationSchema()['operatingSystem'] as string;
    const listed = operatingSystem.split(', ');

    expect(listed).toEqual(releasedPlatforms());
    expect(listed).toEqual([
      ...new Set(RELEASED_SURFACES.flatMap((surface) => SURFACE_PLATFORMS[surface])),
    ]);
    for (const surface of UNRELEASED_SURFACES) {
      for (const platform of SURFACE_PLATFORMS[surface]) {
        if (releasedPlatforms().includes(platform)) continue;
        expect(listed, `${platform} belongs to unreleased ${surface}`).not.toContain(platform);
      }
    }
  });

  it.each([
    ['Organization', organizationSchema],
    ['SoftwareApplication', softwareApplicationSchema],
  ])('%s description names only released surfaces', (_type, build) => {
    const description = build()['description'] as string;

    for (const surface of RELEASED_SURFACES) {
      expect(description).toContain(SURFACE_NAMES[surface]);
    }
    for (const surface of UNRELEASED_SURFACES) {
      expect(description, `${surface} is not released`).not.toMatch(
        new RegExp(`\\b${SURFACE_NAMES[surface]}\\b`, 'i'),
      );
    }
  });

  it('FAQPage schema maps Q/A pairs to Question/Answer nodes', () => {
    const schema = faqPageSchema([{ q: 'Is it free?', a: 'Local and BYOK are free.' }]);
    expect(schema['@type']).toBe('FAQPage');
    const entities = schema['mainEntity'] as {
      '@type': string;
      name: string;
      acceptedAnswer: { text: string };
    }[];
    const first = entities[0];
    expect(first).toBeDefined();
    expect(first?.['@type']).toBe('Question');
    expect(first?.name).toBe('Is it free?');
    expect(first?.acceptedAnswer.text).toBe('Local and BYOK are free.');
  });

  it('BreadcrumbList builds ordered, absolute crumbs', () => {
    const schema = breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Features', path: '/features' },
      { name: 'Agents', path: '/features/agents' },
    ]);
    const items = schema['itemListElement'] as { position: number; item: string }[];
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ position: 1, item: SITE_URL });
    expect(items[2]).toMatchObject({ position: 3, item: `${SITE_URL}/features/agents` });
  });
});

describe('public token pages are never indexable', () => {
  const TOKEN_PAGES = [
    'app/share/[token]/page.tsx',
    'app/shared-artifact/[token]/page.tsx',
    'app/chat/from-share/[token]/page.tsx',
  ];

  it.each(TOKEN_PAGES)('%s marks every metadata branch noindex', (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
    const returns = source.split('generateMetadata')[1] ?? source;
    const metadataReturns = returns.match(/return\s*\{/g) ?? [];
    const noindexMarks = returns.match(/robots:\s*\{\s*index:\s*false/g) ?? [];
    expect(
      noindexMarks.length,
      `${relativePath}: ${metadataReturns.length} metadata branches but ${noindexMarks.length} marked noindex, a shared conversation must never reach a search index`,
    ).toBeGreaterThanOrEqual(metadataReturns.length);
  });
});
