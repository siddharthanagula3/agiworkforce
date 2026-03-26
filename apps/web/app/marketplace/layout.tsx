import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Marketplace',
  description:
    'Browse and deploy pre-built AI agents and skills for your AGI Workforce desktop app. Hundreds of ready-to-use automations for business, code, research, and more.',
  keywords: [
    'AI agent marketplace',
    'pre-built AI agents',
    'AI skills store',
    'automation templates',
    'AGI Workforce marketplace',
    'no-code AI agents',
  ],
  openGraph: {
    title: 'AI Agent Marketplace | AGI Workforce',
    description:
      'Browse hundreds of ready-to-deploy AI agents and skills. One click to install, instant automation.',
    type: 'website',
    url: 'https://agiworkforce.com/marketplace',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce AI Agent Marketplace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Agent Marketplace | AGI Workforce',
    description:
      'Browse hundreds of ready-to-deploy AI agents and skills. One click to install, instant automation.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/marketplace',
  },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'AI Agent Marketplace',
            description:
              'Browse and deploy pre-built AI agents and skills for your AGI Workforce desktop app. Hundreds of ready-to-use automations.',
            url: 'https://agiworkforce.com/marketplace',
          }),
        }}
      />
      {children}
    </>
  );
}
