import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Marketplace — Coming Q4 2026',
  description:
    'AI agent and MCP server directory for AGI Workforce. Coming Q4 2026. Join the waitlist to be notified when the marketplace opens for browsing and one-click install.',
  keywords: [
    'AI agent marketplace',
    'pre-built AI agents',
    'AI skills store',
    'MCP server directory',
    'AGI Workforce marketplace',
    'AGI Workforce roadmap',
  ],
  openGraph: {
    title: 'AI Agent Marketplace — Coming Q4 2026 | AGI Workforce',
    description:
      'AI agent and MCP server directory. Coming Q4 2026. Join the waitlist to be notified.',
    type: 'website',
    url: 'https://agiworkforce.com/marketplace',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce AI Agent Marketplace — Coming Q4 2026',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Agent Marketplace — Coming Q4 2026 | AGI Workforce',
    description: 'AI agent and MCP server directory. Coming Q4 2026.',
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
            name: 'AI Agent Marketplace — Coming Q4 2026',
            description:
              'AI agent and MCP server directory for AGI Workforce. Coming Q4 2026. Join the waitlist to be notified when the marketplace opens.',
            url: 'https://agiworkforce.com/marketplace',
          }),
        }}
      />
      {children}
    </>
  );
}
