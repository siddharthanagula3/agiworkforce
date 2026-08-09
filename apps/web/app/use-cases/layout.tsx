import type { Metadata } from 'next';

/**
 * Audience copy here must match the pages that actually exist under
 * `app/use-cases/`: startups, consulting firms, IT service providers, and sales
 * teams.
 *
 * This metadata previously advertised healthcare, legal, finance, and education
 * verticals. None of them has a route, a domain policy, disclaimers, sourcing,
 * or an evaluation — AGI is generic chat for those users, and the terms page
 * explicitly tells people not to rely on output for legal, medical, or
 * financial decisions. `use-cases/__tests__/use-cases-metadata.test.ts` fails if
 * an industry term reappears here without a matching route.
 */
export const metadata: Metadata = {
  title: 'Use Cases',
  description:
    'See how teams use AGI for AI automation across startups, consulting firms, IT service providers, and sales teams. Real workflows, real results.',
  keywords: [
    'AI automation use cases',
    'AI for business',
    'AI for startups',
    'AI for consultants',
    'AI for IT service providers',
    'AI for sales teams',
    'enterprise AI automation',
  ],
  openGraph: {
    title: 'Use Cases',
    description:
      'How real teams use AGI across startups, consulting firms, IT service providers, and sales teams.',
    type: 'website',
    url: 'https://agiworkforce.com/use-cases',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI Use Cases',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use Cases',
    description:
      'How real teams use AGI across startups, consulting firms, IT service providers, and sales teams.',
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/use-cases',
  },
};

export default function UseCasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
