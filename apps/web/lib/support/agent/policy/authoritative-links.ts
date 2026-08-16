
import { SITE_URL } from '@/lib/seo/site';
import type { HardAbstainCategory, SupportCitation } from '../types';

export interface AuthoritativeLink {
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

export const ALL_AUTHORITATIVE_PATHS: readonly string[] = Object.freeze(
  Object.values(AUTHORITATIVE_LINKS).flatMap((links) => links.map((link) => link.path)),
);

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
