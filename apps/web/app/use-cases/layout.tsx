import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Use Cases',
  description:
    'See how teams use AGI for AI automation across consulting, sales, healthcare, legal, finance, education, and IT. Real workflows, real results.',
  keywords: [
    'AI automation use cases',
    'AI for business',
    'AI for consultants',
    'AI for sales teams',
    'AI for healthcare',
    'AI for legal',
    'enterprise AI automation',
  ],
  openGraph: {
    title: 'Use Cases | AGI',
    description:
      'How real teams use AGI across consulting, sales, healthcare, legal, finance, and IT.',
    type: 'website',
    url: 'https://agiworkforce.com/use-cases',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Use Cases',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use Cases | AGI',
    description:
      'How real teams use AGI across consulting, sales, healthcare, legal, finance, and IT.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/use-cases',
  },
};

export default function UseCasesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
