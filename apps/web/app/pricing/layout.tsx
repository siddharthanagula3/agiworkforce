import { Metadata } from 'next';

const TITLE = 'Pricing: what each plan and each route costs';
const DESCRIPTION =
  'AGI public alpha pricing for Free, Basic, Pro, Max 5x, Max 15x, Team, and Enterprise, with Local and BYOK choices kept separate from managed cloud.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI pricing plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
