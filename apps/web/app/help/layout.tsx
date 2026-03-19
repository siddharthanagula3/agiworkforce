import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center',
  description:
    'Get help with AGI Workforce. Step-by-step guides, troubleshooting articles, and community support for AI automation.',
  keywords: [
    'AGI Workforce help',
    'AI agent support',
    'troubleshooting',
    'how to use AGI Workforce',
    'AI automation guide',
  ],
  openGraph: {
    title: 'Help Center | AGI Workforce',
    description:
      'Find answers fast. Guides, troubleshooting articles, and community support for AGI Workforce.',
    type: 'website',
    url: 'https://agiworkforce.com/help',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Help Center',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help Center | AGI Workforce',
    description:
      'Find answers fast. Guides, troubleshooting articles, and community support for AGI Workforce.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/help',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
