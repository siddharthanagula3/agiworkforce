import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans | AGI',
  description:
    'AGI pricing: local and BYOK are the MVP paths. Managed cloud remains waitlisted until metering, abuse controls, and provider terms are proven.',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
  ],
  openGraph: {
    title: 'Pricing Plans | AGI',
    description:
      'Local and BYOK first. Managed cloud stays waitlisted while production controls are proven.',
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Pricing Plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing Plans | AGI',
    description:
      'Local and BYOK first. Managed cloud stays waitlisted while production controls are proven.',
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
