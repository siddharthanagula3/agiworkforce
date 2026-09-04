import type { Metadata } from 'next';

import { OG_IMAGE, SITE_NAME, TWITTER_HANDLE, absoluteUrl } from './site';

export interface BuildMetadataOptions {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogType?: 'website' | 'article';
  imageAlt?: string;
  robots?: Metadata['robots'];
}

/**
 * Build page-specific metadata with a complete Open Graph + Twitter card.
 *
 * Why this exists: Next.js does NOT derive `og:title`/`og:description` from a
 * page's `title`/`description`, and it does NOT deep-merge a child page's
 * `openGraph` into the root layout's. A public page that sets only `title` and
 * `alternates.canonical` therefore inherits the layout's ENTIRE Open Graph
 * object, the home share card, so every such page unfurls as the homepage on
 * social and in AI answer engines. `buildMetadata` emits a full, self-contained
 * `openGraph` and `twitter` block (image dimensions included, sourced from
 * {@link OG_IMAGE}) plus a page-specific canonical, closing that gap in one place.
 */
export function buildMetadata(options: BuildMetadataOptions): Metadata {
  const {
    title,
    description,
    path,
    keywords,
    ogTitle,
    ogDescription,
    ogType = 'website',
    imageAlt,
    robots,
  } = options;

  const canonical = absoluteUrl(path);
  const resolvedOgTitle = ogTitle ?? title;
  const resolvedOgDescription = ogDescription ?? description;
  const image = {
    url: OG_IMAGE.url,
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: imageAlt ?? OG_IMAGE.alt,
  };

  return {
    title,
    description,
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    alternates: { canonical },
    openGraph: {
      type: ogType,
      locale: 'en_US',
      siteName: SITE_NAME,
      url: canonical,
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [image.url],
    },
    ...(robots ? { robots } : {}),
  };
}
