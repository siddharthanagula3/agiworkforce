import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import Providers from './providers';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { SkipLinks } from '@/components/accessibility/SkipLinks';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'AGI Workforce | Your On-Demand AI Workforce',
    template: '%s | AGI Workforce',
  },
  description:
    'Just tell the AI what you want done. No setup, no coding required. Desktop and web automation with full undo support. Powered by OpenAI, Anthropic, Google, and more.',
  keywords: [
    'AI agents',
    'automation',
    'AGI',
    'workforce',
    'autonomous agents',
    'chat-first AI',
    'no-code automation',
    'reversible AI',
  ],
  authors: [{ name: 'AGI Automation LLC' }],
  creator: 'AGI Automation LLC',
  publisher: 'AGI Automation LLC',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'AGI Workforce',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description:
      'Just tell the AI what you want done. No setup, no coding required. Full undo support.',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Just ask, it does',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description:
      'Just tell the AI what you want done. No setup, no coding required. Desktop and web automation with full undo support. Powered by OpenAI, Anthropic, Google, and more.',
    creator: '@agiworkforce',
    images: ['/app-preview.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request nonce set by middleware for CSP compliance
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  // Only wire GA4 when the tracking ID env var is set
  const gaTrackingId = process.env['NEXT_PUBLIC_GA_TRACKING_ID'];

  // JSON-LD Schema for Organization
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AGI Workforce',
    url: APP_URL,
    logo: `${APP_URL}/logo.png`,
    description:
      'Just tell the AI what you want done. No setup, no coding required. Desktop and web automation with full undo support.',
    sameAs: ['https://twitter.com/agiworkforce', 'https://github.com/agiworkforce'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'contact@agiworkforce.com',
    },
  };

  // JSON-LD Schema for SoftwareApplication
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AGI Workforce',
    description: 'Autonomous AI agents for desktop and web automation with multi-LLM support',
    applicationCategory: 'Business Application',
    operatingSystem: 'macOS, Windows, Linux, Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    url: APP_URL,
  };

  // JSON-LD Schema for WebSite with SearchAction
  const webSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AGI Workforce',
    url: APP_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${APP_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Organization Schema */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {/* SoftwareApplication Schema */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
        {/* WebSite Schema with SearchAction */}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SkipLinks />
        <Providers>{children}</Providers>
        {/* GA4: only rendered when NEXT_PUBLIC_GA_TRACKING_ID is set */}
        {gaTrackingId && <GoogleAnalytics trackingId={gaTrackingId} nonce={nonce} />}
      </body>
    </html>
  );
}
