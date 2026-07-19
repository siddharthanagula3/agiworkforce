import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | AGI Cloud, Local, and BYOK plans',
  description:
    'AGI public alpha pricing for Free, Basic, Pro, Max 5x, Max 15x, Team, and Enterprise, with Local and BYOK choices kept separate from Managed Cloud.',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
    'AI for teams',
    'enterprise AI',
  ],
  openGraph: {
    title: 'Pricing | AGI Cloud, Local, and BYOK plans',
    description:
      'Compare Free, Basic, Pro, Max 5x, Max 15x, Team, and Enterprise while keeping Local and BYOK separate from Managed Cloud.',
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/app-preview.png',
        width: 1024,
        height: 665,
        alt: 'AGI pricing plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | AGI Cloud, Local, and BYOK plans',
    description: 'Compare AGI Managed Cloud plans and the separate Local and BYOK choices.',
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
