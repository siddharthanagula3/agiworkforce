import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Local & BYOK free forever, AGI Cloud for Teams & Enterprise',
  description:
    'AGI pricing: Local and BYOK are free forever on Desktop and CLI, managed cloud is open in public alpha (Free/Basic/Pro/Max as the individual on-ramp), and Team & Enterprise plans give your org shared, governed access to frontier models.',
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
    title: 'Pricing | Local & BYOK free forever, AGI Cloud for Teams & Enterprise',
    description:
      'Local and BYOK stay free forever. Team and Enterprise plans give your org shared, governed access to frontier models with centralized billing.',
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
    title: 'Pricing | Local & BYOK free forever, AGI Cloud for Teams & Enterprise',
    description:
      'Local and BYOK stay free forever. Team and Enterprise plans give your org shared, governed access to frontier models with centralized billing.',
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
