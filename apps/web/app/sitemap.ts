import { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo/site';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface RouteConfig {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
}

const routes: RouteConfig[] = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' },

  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/get-started', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/download', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/business', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/teams', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/solutions', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/enterprise', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/contact-sales', priority: 0.6, changeFrequency: 'monthly' },

  { path: '/providers', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/byok', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/local', priority: 0.9, changeFrequency: 'monthly' },

  { path: '/web', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/desktop', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/mobile', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/mobile/legal', priority: 0.45, changeFrequency: 'monthly' },
  { path: '/cli', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/chrome-extension', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/vscode-extension', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/agi-code', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/agi-work', priority: 0.8, changeFrequency: 'weekly' },

  { path: '/features', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/agents', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/ai-chat', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/artifacts', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/deep-research', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/memory', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/plugins', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/projects', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/tools', priority: 0.8, changeFrequency: 'weekly' },

  { path: '/apps', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/skills', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/connectors', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/connectors/mcp-directory', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/plugins', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/integrations', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' },

  { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/docs/byok-env', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/api-docs', priority: 0.7, changeFrequency: 'weekly' },

  { path: '/waitlist', priority: 0.8, changeFrequency: 'weekly' },

  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.7, changeFrequency: 'daily' },
  { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/careers', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/resources', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/customers', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/partners', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/press', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/community', priority: 0.6, changeFrequency: 'weekly' },

  { path: '/use-cases', priority: 0.75, changeFrequency: 'weekly' },
  { path: '/use-cases/consulting', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/it-providers', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/sales-teams', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/startups', priority: 0.65, changeFrequency: 'monthly' },

  { path: '/help', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/status', priority: 0.7, changeFrequency: 'daily' },

  { path: '/trust', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/acceptable-use', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/disclaimer', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/agent-permissions', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/dpa', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/sla', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/subprocessors', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/accessibility', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/refund-policy', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/copyright', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/model-licenses', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/legal', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/legal/eu-representative', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/data-use', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/privacy/india', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/privacy/requests', priority: 0.6, changeFrequency: 'yearly' },

  { path: '/sitemap-page', priority: 0.4, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-08-13');
  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
