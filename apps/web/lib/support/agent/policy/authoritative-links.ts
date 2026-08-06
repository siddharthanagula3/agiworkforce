/**
 * Authoritative links for each hard-abstain category.
 *
 * Every registered path is asserted to resolve to a real `app/**\/page.tsx` by
 * `authoritative-links.test.ts`, so an authoritative link cannot rot into a 404
 * — which would turn an honest refusal into a dead end.
 */

import { SITE_URL } from '@/lib/seo/site';
import type { HardAbstainCategory, SupportCitation } from '../types';

export interface AuthoritativeLink {
  /** Site-relative path. Must resolve to a real page. */
  path: string;
  title: string;
  description: string;
}

export const AUTHORITATIVE_LINKS: Readonly<Record<HardAbstainCategory, AuthoritativeLink[]>> =
  Object.freeze({
    billing: [
      {
        path: '/pricing',
        title: 'Pricing',
        description: 'Current plans, what each one includes, and how usage is metered.',
      },
      {
        path: '/settings/billing',
        title: 'Billing settings',
        description: 'Your own subscription, invoices, and payment method.',
      },
      {
        path: '/refund-policy',
        title: 'Refund policy',
        description: 'The published refund terms.',
      },
    ],
    data_deletion: [
      {
        path: '/privacy',
        title: 'Privacy policy',
        description: 'What is stored, for how long, and how deletion works.',
      },
      {
        path: '/settings/privacy',
        title: 'Privacy settings',
        description: 'Export or delete your own data.',
      },
    ],
    security: [
      {
        path: '/security',
        title: 'Security',
        description: 'How the product is secured and how to report an issue.',
      },
      {
        path: '/trust',
        title: 'Trust centre',
        description: 'Compliance posture and current attestations.',
      },
    ],
    legal: [
      {
        path: '/terms',
        title: 'Terms of service',
        description: 'The agreement that governs use of the product.',
      },
      {
        path: '/dpa',
        title: 'Data processing addendum',
        description: 'The DPA covering processing of personal data.',
      },
      {
        path: '/legal',
        title: 'Legal index',
        description: 'Every published legal document in one place.',
      },
    ],
  });

/** Flat list of every registered path — used by the route-existence test. */
export const ALL_AUTHORITATIVE_PATHS: readonly string[] = Object.freeze(
  Object.values(AUTHORITATIVE_LINKS).flatMap((links) => links.map((link) => link.path)),
);

/**
 * Static-data citation targets. Declared here rather than in the corpus adapter
 * so the same route-existence test covers them.
 */
export const STATIC_DATA_CITATION_PATHS: readonly string[] = Object.freeze([
  '/help',
  '/pricing',
  '/privacy',
  '/faq',
  '/providers',
  '/support',
]);

export function authoritativeCitations(category: HardAbstainCategory): SupportCitation[] {
  return AUTHORITATIVE_LINKS[category].map((link) => ({
    title: link.title,
    url: `${SITE_URL}${link.path}`,
    snippet: link.description,
    docId: `authoritative:${category}`,
    chunkId: `authoritative:${category}:${link.path}`,
  }));
}
