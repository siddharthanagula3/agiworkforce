import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/seo/site';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Find answers to common questions about AGI: features, trust modes, platform support, security, and how to get started.',
  keywords: [
    'AGI FAQ',
    'AI automation questions',
    'AGI pricing',
    'AI agents help',
    'workflow automation FAQ',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/faq',
  },
  openGraph: {
    title: 'FAQ',
    description: 'Find answers to common questions about AGI features, trust modes, and security.',
    url: 'https://agiworkforce.com/faq',
    siteName: 'AGI',
    type: 'website',
    images: [
      {
        url: OG_IMAGE.url,
        width: 1200,
        height: 630,
        alt: 'AGI FAQ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ',
    description: 'Find answers to common questions about AGI.',
    images: [OG_IMAGE.url],
    creator: '@agiworkforce',
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
