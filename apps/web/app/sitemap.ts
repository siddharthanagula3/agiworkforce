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

    // Differentiator pages
    { path: '/providers', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/byok', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/local', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/compare', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/compare/claude', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/compare/chatgpt', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/compare/gemini', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/compare/perplexity', priority: 0.7, changeFrequency: 'monthly' },

    // Surface landing pages
    { path: '/desktop', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/mobile', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/cli', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/chrome-extension', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/vscode-extension', priority: 0.8, changeFrequency: 'weekly' },

    // Feature pages
    { path: '/features/ai-skills', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/agents', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/tools', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/plugins', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/features/ai-chat', priority: 0.8, changeFrequency: 'weekly' },

    // Use case pages
    { path: '/use-cases', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/use-cases/consulting', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/sales-teams', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/it-providers', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/use-cases/startups', priority: 0.7, changeFrequency: 'monthly' },

    // Documentation / developer
    { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/api-docs', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/integrations', priority: 0.8, changeFrequency: 'weekly' },

    // Marketplace / Gallery
    { path: '/marketplace', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' },

    // Company / content
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.7, changeFrequency: 'daily' },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/careers', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/resources', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/customers', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/partners', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/press', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/community', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/enterprise', priority: 0.8, changeFrequency: 'monthly' },

    // Support / help
    { path: '/help', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/contact-sales', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/faq', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/diagnose', priority: 0.5, changeFrequency: 'weekly' },
    { path: '/status', priority: 0.7, changeFrequency: 'daily' },

    // Trust / legal
    { path: '/trust', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/security', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/dpa', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/sla', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/subprocessors', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/accessibility', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/refund-policy', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/legal', priority: 0.5, changeFrequency: 'yearly' },

    // HTML sitemap
    { path: '/sitemap-page', priority: 0.4, changeFrequency: 'monthly' },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date('2026-05-05'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
