import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/seo/site';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get technical support for AGI. Report bugs, request features, check system status, or contact our support team directly.',
  keywords: [
    'AGI support',
    'AI agent help',
    'technical support',
    'bug report',
    'feature request',
    'contact support',
  ],
  openGraph: {
    title: 'Support',
    description: 'Need help? Contact our support team, report bugs, or request features.',
    type: 'website',
    url: 'https://agiworkforce.com/support',
    images: [
      {
        url: OG_IMAGE.url,
        width: 1200,
        height: 630,
        alt: 'AGI Support',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Support',
    description: 'Need help? Contact our support team, report bugs, or request features.',
    images: [OG_IMAGE.url],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/support',
  },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
