// Dynamic sitemap generation utility
// Generates XML sitemap based on actual routes

export interface SitemapEntry {
  path: string;
  priority: number;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  lastmod?: string;
}

export const publicRoutes: SitemapEntry[] = [
  // Main pages
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/business', priority: 0.9, changefreq: 'weekly' },
  { path: '/teams', priority: 0.85, changefreq: 'weekly' },
  { path: '/solutions', priority: 0.85, changefreq: 'weekly' },
  { path: '/pricing', priority: 0.9, changefreq: 'weekly' },
  { path: '/about', priority: 0.8, changefreq: 'monthly' },
  { path: '/contact-sales', priority: 0.8, changefreq: 'monthly' },

  // Help & Resources
  { path: '/help', priority: 0.7, changefreq: 'weekly' },
  { path: '/docs', priority: 0.7, changefreq: 'weekly' },
  { path: '/api-docs', priority: 0.7, changefreq: 'weekly' },
  { path: '/resources', priority: 0.7, changefreq: 'weekly' },
  { path: '/blog', priority: 0.8, changefreq: 'daily' },

  // Product
  { path: '/apps', priority: 0.9, changefreq: 'weekly' },
  { path: '/agi-code', priority: 0.9, changefreq: 'weekly' },
  { path: '/cowork', priority: 0.8, changefreq: 'weekly' },

  // Use Cases
  { path: '/use-cases', priority: 0.7, changefreq: 'weekly' },
  { path: '/use-cases/startups', priority: 0.6, changefreq: 'monthly' },
  { path: '/use-cases/it-providers', priority: 0.6, changefreq: 'monthly' },
  { path: '/use-cases/sales-teams', priority: 0.6, changefreq: 'monthly' },
  { path: '/use-cases/consulting', priority: 0.6, changefreq: 'monthly' },

  // Features
  { path: '/features/ai-chat', priority: 0.7, changefreq: 'monthly' },
  { path: '/features/artifacts', priority: 0.8, changefreq: 'weekly' },
  { path: '/features/deep-research', priority: 0.8, changefreq: 'weekly' },
  { path: '/features/projects', priority: 0.8, changefreq: 'weekly' },
  { path: '/features/memory', priority: 0.7, changefreq: 'weekly' },

  // Legal
  { path: '/privacy', priority: 0.4, changefreq: 'yearly' },
  { path: '/terms', priority: 0.4, changefreq: 'yearly' },
  { path: '/cookies', priority: 0.3, changefreq: 'yearly' },
];

export function generateSitemap(baseUrl: string = ''): string {
  const now = new Date().toISOString();

  const urls = publicRoutes
    .map((entry) => {
      const lastmod = entry.lastmod || now;
      return `  <url>
    <loc>${baseUrl}${entry.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function generateSitemapIndex(baseUrl: string = ''): string {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-pages.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
}
