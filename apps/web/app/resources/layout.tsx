import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Guides, tutorials, videos, and resources for getting the most out of AGI Workforce. Learn AI automation from beginner to expert.',
  keywords: [
    'AI automation resources',
    'AGI Workforce tutorials',
    'AI agent guides',
    'automation learning',
    'AI productivity tips',
  ],
  openGraph: {
    title: 'Resources | AGI Workforce',
    description:
      'Guides, tutorials, and resources to master AI automation with AGI Workforce. From beginner to expert.',
    type: 'website',
    url: 'https://agiworkforce.com/resources',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Resources',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Resources | AGI Workforce',
    description:
      'Guides, tutorials, and resources to master AI automation with AGI Workforce. From beginner to expert.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/resources',
  },
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
