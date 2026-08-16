import { MetadataRoute } from 'next';

import { DISALLOW_APP, SITE_URL } from '@/lib/seo/site';

const disallow = [...DISALLOW_APP];

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
      { userAgent: '*', allow: '/', disallow, crawlDelay: 1 },

      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),

      { userAgent: 'Googlebot', allow: '/', disallow, crawlDelay: 0.5 },
      { userAgent: 'bingbot', allow: '/', disallow },
      { userAgent: 'Applebot', allow: '/', disallow },

      { userAgent: 'CCBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
