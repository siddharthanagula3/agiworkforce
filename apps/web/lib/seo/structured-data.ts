/**
 * Schema.org JSON-LD builders.
 *
 * Every builder returns a plain object that {@link ../../components/seo/JsonLd}
 * serializes into a CSP-nonce-carrying `<script type="application/ld+json">`.
 * Keep the asserted facts honest: no `SearchAction` (the only search is the
 * authenticated in-app search, not a public site search endpoint), no `offers`
 * or `aggregateRating` we cannot substantiate.
 */

import {
  OG_IMAGE_URL,
  SITE_ALTERNATE_NAME,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
  absoluteUrl,
} from './site';
import {
  AVAILABLE_NOW_LABEL,
  RELEASED_SURFACES,
  SURFACE_NAMES,
  joinSurfaceNames,
  releasedPlatforms,
} from '@/lib/surface-status';

type JsonLdObject = Record<string, unknown>;

const RELEASED_ON = `${AVAILABLE_NOW_LABEL} on ${joinSurfaceNames(
  RELEASED_SURFACES.map((surface) => SURFACE_NAMES[surface]),
)}.`;

export function organizationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: `AI workspace for chat, projects, artifacts, memory, and web research. ${RELEASED_ON}`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: SUPPORT_EMAIL,
    },
  };
}

export function webSiteSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: SITE_URL,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
}

export function softwareApplicationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: `AI workspace with chat, projects and artifacts on managed cloud. ${RELEASED_ON}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: releasedPlatforms().join(', '),
    url: SITE_URL,
    image: OG_IMAGE_URL,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
}

export function faqPageSchema(items: readonly { q: string; a: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function articleSchema(article: {
  title: string;
  path: string;
  updated: string;
  description?: string | null;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    url: absoluteUrl(article.path),
    mainEntityOfPage: absoluteUrl(article.path),
    dateModified: article.updated,
    ...(article.description ? { description: article.description } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  };
}

export function breadcrumbSchema(crumbs: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path === '/' ? '' : crumb.path}`,
    })),
  };
}
