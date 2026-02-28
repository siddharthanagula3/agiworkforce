/**
 * SEO Head Component
 * Uses Next.js head for client-side meta tag injection.
 * For server-rendered pages, use generateMetadata in page.tsx instead.
 */

'use client';

import React, { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
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
  noindex?: boolean;
  nofollow?: boolean;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'AGI Workforce - AI Workforce Platform',
  description = 'Transform your business with AI employees. Hire, manage, and scale your AI workforce with our comprehensive automation platform.',
  structuredData,
}) => {
  // In Next.js App Router, metadata is best handled via generateMetadata
  // in the page.tsx file. This component provides a client-side fallback
  // for dynamically updating the document title.
  useEffect(() => {
    if (title && typeof document !== 'undefined') {
      document.title = title;
    }
  }, [title]);

  // Inject structured data via a script tag if provided
  if (structuredData) {
    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    );
  }

  return null;
};

export { SEOHead };
export type { SEOHeadProps };
export default SEOHead;
