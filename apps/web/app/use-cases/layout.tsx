import type { Metadata } from 'next';

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
