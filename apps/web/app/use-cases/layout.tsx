import type { Metadata } from 'next';

const TITLE = 'Use cases: startups, consultants, sales, and IT providers';
const DESCRIPTION =
  'How AGI is used across startups, consulting firms, IT service providers, and sales teams: one page per job, each opening on the surface that job runs on.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: 'https://agiworkforce.com/use-cases',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI use cases',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
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
