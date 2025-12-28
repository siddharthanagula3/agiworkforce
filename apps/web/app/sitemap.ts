import { MetadataRoute } from 'next';

interface RouteConfig {
  path: string;
  priority: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://agiworkforce.com';

  const routes: RouteConfig[] = [
    // Primary pages
    { path: '', priority: 1.0, changeFrequency: 'weekly' },

    // Key feature pages
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/get-started', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/download', priority: 0.8, changeFrequency: 'weekly' },

    // Legal/Policy pages
    { path: '/privacy', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.7, changeFrequency: 'yearly' },

    // Support/Help pages
    { path: '/diagnose', priority: 0.6, changeFrequency: 'weekly' },

    // Auth pages (lower priority - users already logged in)
    { path: '/login', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/signup', priority: 0.5, changeFrequency: 'yearly' },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
