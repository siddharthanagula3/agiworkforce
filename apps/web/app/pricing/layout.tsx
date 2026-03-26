import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans | AGI Workforce',
  description:
    'Choose the perfect plan for your AI automation needs. From hobbyists to enterprises, AGI Workforce has a plan for you. Start free or upgrade anytime.',
  keywords: [
    'AI pricing',
    'AI agent plans',
    'AGI Workforce pricing',
    'AI automation cost',
    'BYOK AI',
    'AI subscription',
  ],
  openGraph: {
    title: 'Pricing Plans | AGI Workforce',
    description:
      'Affordable AI agent automation. Hobby, Pro, and Max plans. Start free or upgrade anytime.',
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Pricing Plans',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing Plans | AGI Workforce',
    description:
      'Affordable AI agent automation plans. Start free, upgrade when ready. No credit card required.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/pricing',
  },
};

// JSON-LD for Product/Pricing schema
const pricingSchema = {
  '@context': 'https://schema.org',
  '@type': 'AggregateOffer',
  priceCurrency: 'USD',
  offers: [
    {
      '@type': 'Offer',
      name: 'Hobby Plan',
      description: 'Perfect for getting started with AI automation',
      price: '10',
      priceCurrency: 'USD',
      priceValidUntil: '2026-12-31',
      url: 'https://agiworkforce.com/pricing',
      availability: 'https://schema.org/InStock',
      billingDuration: 'P1M',
    },
    {
      '@type': 'Offer',
      name: 'Pro Plan',
      description: 'Less than $1/day for full AI automation',
      price: '29.99',
      priceCurrency: 'USD',
      priceValidUntil: '2026-12-31',
      url: 'https://agiworkforce.com/pricing',
      availability: 'https://schema.org/InStock',
      billingDuration: 'P1M',
    },
    {
      '@type': 'Offer',
      name: 'Max Plan',
      description: 'Power users running complex autonomous workflows',
      price: '299.99',
      priceCurrency: 'USD',
      priceValidUntil: '2026-12-31',
      url: 'https://agiworkforce.com/pricing',
      availability: 'https://schema.org/InStock',
      billingDuration: 'P1M',
    },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />
      {children}
    </>
  );
}
