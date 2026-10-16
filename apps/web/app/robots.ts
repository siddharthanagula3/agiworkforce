import { MetadataRoute } from 'next';

import { DISALLOW_APP, OG_IMAGE_PATH, SITE_URL } from '@/lib/seo/site';

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

const SHARE_IMAGE_ALLOW = [`${OG_IMAGE_PATH}$`, `${OG_IMAGE_PATH}?`];

const ALLOWED_CRAWLERS = ['*', ...AI_CRAWLERS, 'Googlebot', 'bingbot', 'Applebot'];

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

      { userAgent: ALLOWED_CRAWLERS, allow: SHARE_IMAGE_ALLOW },

      { userAgent: 'CCBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
