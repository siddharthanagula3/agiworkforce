import { monitoringService } from './system-monitor';
import { logger } from '@/lib/logger';

interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  twitterSite?: string;
  twitterCreator?: string;
  structuredData?: Record<string, unknown>;
  robots?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
}

interface PageSEOData extends SEOData {
  path: string;
  lastModified?: string;
  priority?: number;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

class SEOService {
  private isInitialized = false;
  private baseUrl: string;
  private defaultSEO: SEOData;

  constructor() {
    this.baseUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://agiworkforce.com';
    this.defaultSEO = {
      title: 'AGI - Beyond one model. Beyond one surface.',
      description:
        'All the AIs you already pay for, in one place. Beyond one model. Beyond one surface. AGI in your hands.',
      keywords: [
        'AI agents',
        'agentic AI',
        'AI workforce',
        'artificial intelligence',
        'AI chat',
        'business automation',
      ],
      ogType: 'website',
      twitterCard: 'summary_large_image',
      twitterSite: '@agiworkforce',
      robots: 'index, follow',
    };
  }

  initialize(): void {
    if (this.isInitialized) return;

    this.setupMetaTagManagement();

    this.setupStructuredData();

    this.setupSitemapGeneration();

    this.isInitialized = true;
    logger.info('SEO service initialized');
  }

  updatePageSEO(seoData: Partial<SEOData>, path?: string): void {
    const currentPath = path || window.location.pathname;
    const fullSEO = { ...this.defaultSEO, ...seoData };

    document.title = fullSEO.title;

    this.updateMetaTag('description', fullSEO.description);
    this.updateMetaTag('keywords', fullSEO.keywords.join(', '));
    this.updateMetaTag('author', fullSEO.author || '');
    this.updateMetaTag('robots', fullSEO.robots || '');

    this.updateMetaTag('og:title', fullSEO.title, 'property');
    this.updateMetaTag('og:description', fullSEO.description, 'property');
    this.updateMetaTag('og:type', fullSEO.ogType || '', 'property');
    this.updateMetaTag('og:url', this.getCanonicalUrl(currentPath), 'property');
    this.updateMetaTag('og:image', fullSEO.ogImage || '', 'property');
    this.updateMetaTag('og:site_name', 'AGI', 'property');

    this.updateMetaTag('twitter:card', fullSEO.twitterCard || '');
    this.updateMetaTag('twitter:site', fullSEO.twitterSite || '');
    this.updateMetaTag('twitter:creator', fullSEO.twitterCreator || '');
    this.updateMetaTag('twitter:title', fullSEO.title);
    this.updateMetaTag('twitter:description', fullSEO.description);
    this.updateMetaTag('twitter:image', fullSEO.ogImage || '');

    this.updateCanonicalUrl(fullSEO.canonicalUrl || this.getCanonicalUrl(currentPath));

    if (fullSEO.structuredData) {
      this.updateStructuredData(fullSEO.structuredData);
    }

    monitoringService.trackEvent('seo_update', {
      path: currentPath,
      title: fullSEO.title,
      hasStructuredData: !!fullSEO.structuredData,
    });
  }

  generateStructuredData(type: string, data: Record<string, unknown>): Record<string, unknown> {
    const baseStructuredData = {
      '@context': 'https://schema.org',
      '@type': type,
      url: this.getCanonicalUrl(window.location.pathname),
      name: data['name'] || document.title,
      description: data['description'] || this.getMetaContent('description'),
    };

    switch (type) {
      case 'WebSite':
        return {
          ...baseStructuredData,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${this.baseUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        };

      case 'Organization':
        return {
          ...baseStructuredData,
          logo: `${this.baseUrl}/logo.png`,
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: '+1-555-0123',
            contactType: 'customer service',
            availableLanguage: 'English',
          },
          sameAs: [
            'https://twitter.com/agiworkforce',
            'https://linkedin.com/company/agi-workforce',
            'https://github.com/agiworkforce',
          ],
        };

      case 'Article':
        return {
          ...baseStructuredData,
          headline: data['headline'],
          author: {
            '@type': 'Person',
            name: data['author'] || 'AGI Team',
          },
          publisher: {
            '@type': 'Organization',
            name: 'AGI',
            logo: {
              '@type': 'ImageObject',
              url: `${this.baseUrl}/logo.png`,
            },
          },
          datePublished: data['datePublished'],
          dateModified: data['dateModified'],
          image: data['image'],
        };

      case 'Product':
        return {
          ...baseStructuredData,
          brand: {
            '@type': 'Brand',
            name: 'AGI',
          },
          offers: {
            '@type': 'Offer',
            price: data['price'],
            priceCurrency: data['priceCurrency'] || 'USD',
            availability: 'https://schema.org/InStock',
          },
          aggregateRating: data['aggregateRating'],
        };

      case 'SoftwareApplication':
        return {
          ...baseStructuredData,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web Browser',
          offers: {
            '@type': 'Offer',
            price: data['price'] || '0',
            priceCurrency: 'USD',
          },
          aggregateRating: data['aggregateRating'],
        };

      default:
        return baseStructuredData;
    }
  }

  generateSitemapData(): PageSEOData[] {
    const pages: PageSEOData[] = [
      {
        path: '/',
        title: 'AGI - Beyond one model. Beyond one surface.',
        description:
          'All the AIs you already pay for, in one place. Beyond one model. Beyond one surface.',
        keywords: ['AI', 'automation', 'workforce', 'artificial intelligence'],
        priority: 1.0,
        changeFrequency: 'daily',
      },
      {
        path: '/pricing',
        title: 'Pricing - AGI',
        description:
          'Choose the perfect plan for your AI workforce needs. Flexible pricing for businesses of all sizes.',
        keywords: ['pricing', 'AI workforce', 'subscription', 'plans'],
        priority: 0.9,
        changeFrequency: 'weekly',
      },
      {
        path: '/apps',
        title: 'Apps and Connectors - AGI',
        description:
          'Connect AGI to apps, MCP servers, desktop extensions, files, and work tools with explicit permissions.',
        keywords: ['AI apps', 'MCP connectors', 'AI integrations', 'desktop extensions'],
        priority: 0.9,
        changeFrequency: 'weekly',
      },
      {
        path: '/about',
        title: 'About Us - AGI',
        description:
          'Learn about our mission to democratize AI workforce automation and empower businesses.',
        keywords: ['about', 'company', 'mission', 'AI workforce'],
        priority: 0.7,
        changeFrequency: 'monthly',
      },
      {
        path: '/blog',
        title: 'Blog - AGI',
        description:
          'Latest insights, tutorials, and news about AI workforce automation and business transformation.',
        keywords: ['blog', 'AI insights', 'tutorials', 'automation'],
        priority: 0.8,
        changeFrequency: 'daily',
      },
      {
        path: '/contact-sales',
        title: 'Contact Sales - AGI',
        description:
          'Get in touch with our sales team to discuss your AI workforce automation needs.',
        keywords: ['contact', 'sales', 'AI consultation', 'support'],
        priority: 0.6,
        changeFrequency: 'monthly',
      },
    ];

    return pages;
  }

  private updateMetaTag(name: string, content: string, attribute: string = 'name'): void {
    if (!content) return;

    let meta = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;

    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }

    meta.setAttribute('content', content);
  }

  private getMetaContent(name: string): string {
    const meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
    return meta?.getAttribute('content') || '';
  }

  private updateCanonicalUrl(url: string): void {
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;

    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }

    canonical.setAttribute('href', url);
  }

  private updateStructuredData(data: Record<string, unknown>): void {
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
    existingScripts.forEach((script) => script.remove());

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  private getCanonicalUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private setupMetaTagManagement(): void {
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(viewport);
    }

    if (!document.querySelector('meta[charset]')) {
      const charset = document.createElement('meta');
      charset.setAttribute('charset', 'utf-8');
      document.head.insertBefore(charset, document.head.firstChild);
    }
  }

  private setupStructuredData(): void {
    const organizationData = this.generateStructuredData('Organization', {
      name: 'AGI',
      description: 'AI workforce automation platform',
    });
    this.updateStructuredData(organizationData);
  }

  private setupSitemapGeneration(): void {
    const sitemapData = this.generateSitemapData();

    monitoringService.trackEvent('sitemap_generated', {
      pageCount: sitemapData.length,
      lastGenerated: new Date().toISOString(),
    });
  }

  getCurrentPageSEO(): SEOData {
    return {
      title: document.title,
      description: this.getMetaContent('description'),
      keywords: this.getMetaContent('keywords').split(', '),
      canonicalUrl:
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? undefined,
      ogImage: this.getMetaContent('og:image'),
      ogType: this.getMetaContent('og:type'),
      twitterCard: this.getMetaContent('twitter:card'),
      twitterSite: this.getMetaContent('twitter:site'),
      twitterCreator: this.getMetaContent('twitter:creator'),
      robots: this.getMetaContent('robots'),
      author: this.getMetaContent('author'),
    };
  }

  trackSEOPerformance(): void {
    const seoData = this.getCurrentPageSEO();

    monitoringService.trackEvent('seo_performance', {
      title: seoData.title,
      description: seoData.description,
      hasCanonical: !!seoData.canonicalUrl,
      hasStructuredData: !!document.querySelector('script[type="application/ld+json"]'),
      hasOpenGraph: !!seoData.ogImage,
      hasTwitterCard: !!seoData.twitterCard,
    });
  }
}

export const seoService = new SEOService();
