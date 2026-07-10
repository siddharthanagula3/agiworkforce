import { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo/site';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface RouteConfig {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
}

/**
 * Every indexable public route. Deliberately excludes:
 *  - authenticated app routes (/chat, /settings, /billing, /projects, /user,
 *    /customize, /admin) — disallowed in robots.ts
 *  - redirect-only routes (/privacy-policy, /terms-of-service, /documentation,
 *    /downloads, /sign-in, /sign-up, /register, /marketplace, /ai-skills,
 *    /api-reference, /device-auth, /connectors/new, /connectors/permissions,
 *    /use-cases/consulting-businesses, /use-cases/it-service-providers, ...)
 *  - noindex utility routes (/signup, /login, /forgot-password, /verify, /auth/*)
 *  - dynamic detail routes without published content (/blog/[slug] currently
 *    404s, /plugins/[id], /skills/[name], /share/[token], /shared/[id])
 *
 * Keep this list in lockstep with robots.ts: nothing disallowed there may
 * appear here.
 */
const routes: RouteConfig[] = [
  // Primary
  { path: '', priority: 1.0, changeFrequency: 'weekly' },

  // Key conversion
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/get-started', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/download', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/business', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/teams', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/solutions', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/enterprise', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/contact-sales', priority: 0.6, changeFrequency: 'monthly' },

  // Differentiators
  { path: '/providers', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/byok', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/local', priority: 0.9, changeFrequency: 'monthly' },

  // Surfaces
  { path: '/desktop', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/mobile', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/mobile/legal', priority: 0.45, changeFrequency: 'monthly' },
  { path: '/cli', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/chrome-extension', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/vscode-extension', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/agi-code', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/agi-work', priority: 0.8, changeFrequency: 'weekly' },

  // Product features
  { path: '/features', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/agents', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/ai-chat', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/artifacts', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/deep-research', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/memory', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/plugins', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/features/projects', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/features/tools', priority: 0.8, changeFrequency: 'weekly' },

  // Workspace surfaces
  { path: '/apps', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/skills', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/connectors', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/connectors/mcp-directory', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/plugins', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/integrations', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' },

  // Documentation / developer
  { path: '/docs', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/docs/byok-env', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/api-docs', priority: 0.7, changeFrequency: 'weekly' },

  // Cloud early access
  { path: '/waitlist', priority: 0.8, changeFrequency: 'weekly' },

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
  { path: '/buildathon', priority: 0.4, changeFrequency: 'monthly' },

  // Use cases
  { path: '/use-cases', priority: 0.75, changeFrequency: 'weekly' },
  { path: '/use-cases/consulting', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/it-providers', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/sales-teams', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/use-cases/startups', priority: 0.65, changeFrequency: 'monthly' },

  // Support / help
  { path: '/help', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
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
  { path: '/legal/eu-representative', priority: 0.4, changeFrequency: 'monthly' },

  // HTML sitemap
  { path: '/sitemap-page', priority: 0.4, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-07-08');
  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
