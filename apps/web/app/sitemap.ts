import { MetadataRoute } from 'next';

interface RouteConfig {
  path: string;
  priority: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

  const routes: RouteConfig[] = [
    // Primary pages
    { path: '', priority: 1.0, changeFrequency: 'weekly' },

    // Key conversion pages
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/get-started', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/download', priority: 0.9, changeFrequency: 'weekly' },

    // Feature pages
    { path: '/features/ai-skills', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/agents', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/tools', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/plugins', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/ai-chat', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/ai-dashboards', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/features/ai-project-manager', priority: 0.7, changeFrequency: 'weekly' },

    // Use case pages
    { path: '/use-cases', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/use-cases/consulting', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/sales-teams', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/it-providers', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/startups', priority: 0.7, changeFrequency: 'monthly' },

    // Documentation / developer
    { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/api-docs', priority: 0.7, changeFrequency: 'weekly' },

    // Marketplace / Gallery
    { path: '/marketplace', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' },

    // Company / content
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.7, changeFrequency: 'daily' },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/careers', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/resources', priority: 0.6, changeFrequency: 'weekly' },

    // Support / help
    { path: '/help', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/faq', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/diagnose', priority: 0.5, changeFrequency: 'weekly' },

    // Trust / legal
    { path: '/security', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/legal', priority: 0.5, changeFrequency: 'yearly' },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date('2026-03-18'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
