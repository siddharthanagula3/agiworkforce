import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers',
  description:
    'Join the AGI team. We are hiring engineers, designers, and product thinkers who want to build the future of AI-powered work.',
  keywords: [
    'AGI jobs',
    'AI engineering jobs',
    'startup careers',
    'AI company hiring',
    'remote AI jobs',
    'work at AGI',
  ],
  openGraph: {
    title: 'Careers',
    description:
      'Build the future of AI-powered work. Open roles in AI engineering, product, and operations.',
    type: 'website',
    url: 'https://agiworkforce.com/careers',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'Careers at AGI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Careers',
    description:
      'Build the future of AI-powered work. Open roles in AI engineering, product, and operations.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/careers',
  },
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
