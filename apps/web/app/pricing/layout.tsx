import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Free Local & BYOK, AGI Cloud (Public Alpha)',
  description:
    'AGI pricing: Local and BYOK are free forever on Desktop and CLI, the web trial includes a small Auto Economy cap, and hosted AGI Cloud plans open by waitlist invite.',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
  ],
  openGraph: {
    title: 'Pricing | Free Local & BYOK, AGI Cloud (Public Alpha)',
    description:
      'Local and BYOK stay free forever, the hosted web trial is capped, and AGI Cloud plans open by waitlist invite.',
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI pricing plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | Free Local & BYOK, AGI Cloud (Public Alpha)',
    description:
      'Local and BYOK stay free forever, the hosted web trial is capped, and AGI Cloud plans open by waitlist invite.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
