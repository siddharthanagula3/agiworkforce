import { MetadataRoute } from 'next';

import { DISALLOW_APP, SITE_URL } from '@/lib/seo/site';

/** Mutable copy: `MetadataRoute.Robots` wants `string[]`, not a readonly tuple. */
const disallow = [...DISALLOW_APP];

/**
 * AI answer-engine / training crawlers we intentionally ALLOW so AGI can be
 * cited in ChatGPT, Claude, Perplexity, Google AI Overviews, Apple
 * Intelligence, and Meta AI. Each gets the same app-route disallow as
 * traditional search bots. `CCBot` (Common Crawl) stays blocked below.
 */
const AI_CRAWLERS = [
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule for all bots
      { userAgent: '*', allow: '/', disallow, crawlDelay: 1 },

      // AI answer-engine / training crawlers — explicitly allowed
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),

      // Traditional search engines
      { userAgent: 'Googlebot', allow: '/', disallow, crawlDelay: 0.5 },
      { userAgent: 'bingbot', allow: '/', disallow },
      { userAgent: 'Applebot', allow: '/', disallow },

      // Common Crawl: blocked (it feeds many third-party training sets we do
      // not want a blanket opt-in to).
      { userAgent: 'CCBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
