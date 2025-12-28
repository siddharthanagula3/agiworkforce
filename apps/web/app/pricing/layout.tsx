import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans | AGI Workforce',
  description:
    'Choose the perfect plan for your AI automation needs. From hobbyists to enterprises, AGI Workforce has a plan for you. Start free or upgrade anytime.',
  openGraph: {
    title: 'Pricing Plans | AGI Workforce',
    description:
      'Affordable AI agent automation. Hobby ($0), Pro ($19/mo), Max ($99/mo). Pay only for what you use.',
    type: 'website',
    url: 'https://agiworkforce.com/pricing',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce Pricing',
      },
    ],
  },
  alternates: {
    canonical: 'https://agiworkforce.com/pricing',
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
      description: 'Free forever plan for hobbyists and learners',
      price: '0',
      priceCurrency: 'USD',
      url: 'https://agiworkforce.com/pricing',
      availability: 'https://schema.org/InStock',
    },
    {
      '@type': 'Offer',
      name: 'Pro Plan',
      description: 'Professional plan for teams and small businesses',
      price: '19',
      priceCurrency: 'USD',
      priceValidUntil: '2026-12-31',
      url: 'https://agiworkforce.com/pricing',
      availability: 'https://schema.org/InStock',
      billingDuration: 'P1M',
    },
    {
      '@type': 'Offer',
      name: 'Max Plan',
      description: 'Advanced plan for power users and enterprises',
      price: '99',
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
