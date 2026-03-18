import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule for all bots
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
        crawlDelay: 1,
      },
      // AI Crawlers - allow with same rules as general crawlers
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'Applebot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
        crawlDelay: 0.5,
      },
      {
        userAgent: 'bingbot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/account/', '/auth/'],
      },
      // Respect no-index on sensitive paths
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
    ],
    sitemap: `${process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com'}/sitemap.xml`,
  };
}
