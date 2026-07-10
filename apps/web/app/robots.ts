import { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo/site';

/**
 * Paths kept out of every crawler's index: API surface, admin, auth flows, and
 * the authenticated app itself (chat, settings, billing, projects, user,
 * customize). These carry per-user state and must never appear in search or
 * AI-answer-engine results. Keep in lockstep with sitemap.ts — nothing here may
 * appear there.
 */
const DISALLOW_APP = [
  '/api/',
  '/admin/',
  '/auth/',
  '/dashboard/',
  '/account/',
  '/chat',
  '/settings',
  '/billing',
  '/projects',
  '/user',
  '/customize',
];

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
      { userAgent: '*', allow: '/', disallow: DISALLOW_APP, crawlDelay: 1 },

      // AI answer-engine / training crawlers — explicitly allowed
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW_APP,
      })),

      // Traditional search engines
      { userAgent: 'Googlebot', allow: '/', disallow: DISALLOW_APP, crawlDelay: 0.5 },
      { userAgent: 'bingbot', allow: '/', disallow: DISALLOW_APP },
      { userAgent: 'Applebot', allow: '/', disallow: DISALLOW_APP },

      // Common Crawl: blocked (it feeds many third-party training sets we do
      // not want a blanket opt-in to).
      { userAgent: 'CCBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
