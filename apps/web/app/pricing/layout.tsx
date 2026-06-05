import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans',
  description:
    'AGI pricing: local and BYOK stay free, web trial includes a small Auto Economy cap, and higher hosted cloud capacity opens through account-bound request access.',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
  ],
  openGraph: {
    title: 'Pricing Plans',
    description:
      'Local and BYOK first, a capped hosted web trial, and request access for higher AGI Cloud capacity.',
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
    title: 'Pricing Plans',
    description:
      'Local and BYOK first, a capped hosted web trial, and request access for higher AGI Cloud capacity.',
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
