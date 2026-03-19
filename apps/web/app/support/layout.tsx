import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get technical support for AGI Workforce. Report bugs, request features, check system status, or contact our support team directly.',
  keywords: [
    'AGI Workforce support',
    'AI agent help',
    'technical support',
    'bug report',
    'feature request',
    'contact support',
  ],
  openGraph: {
    title: 'Support | AGI Workforce',
    description:
      'Need help? Contact our support team, report bugs, or request features. We respond fast.',
    type: 'website',
    url: 'https://agiworkforce.com/support',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Support',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Support | AGI Workforce',
    description:
      'Need help? Contact our support team, report bugs, or request features. We respond fast.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/support',
  },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
