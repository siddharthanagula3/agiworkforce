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
