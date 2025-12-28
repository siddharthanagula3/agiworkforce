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
        userAgent: 'Claude-Web',
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
    sitemap: 'https://agiworkforce.com/sitemap.xml',
  };
}
