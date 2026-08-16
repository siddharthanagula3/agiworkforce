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
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
  SUPPORT_EMAIL,
} from './site';

type JsonLdObject = Record<string, unknown>;

export function organizationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      'AI workspace for chat, code, research, files, tools, artifacts, connectors, memory, and automation with explicit Local, BYOK, and public-alpha managed cloud boundaries.',
    sameAs: [...SOCIAL_PROFILES],
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
    url: SITE_URL,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
}

export function softwareApplicationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description:
      'AI workspace with explicit Local, BYOK, and public-alpha managed cloud modes across web, desktop, mobile, CLI, Chrome, and VS Code.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, macOS, Windows, Linux, iOS, Android',
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

export function collectionPageSchema(input: {
  name: string;
  description: string;
  path: string;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: `${SITE_URL}${input.path === '/' ? '' : input.path}`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
}

export function articleSchema(input: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    url: `${SITE_URL}/blog/${input.slug}`,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    image: input.image ?? OG_IMAGE_URL,
    author: { '@type': 'Organization', name: input.author ?? SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${input.slug}` },
  };
}
