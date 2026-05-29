import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono, JetBrains_Mono, Newsreader } from 'next/font/google';
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

// Newsreader: variable serif (opsz axis 6–72) carrying display + body for Tier A/B.
// Subset to Latin only to control payload (~110KB → ~45KB).
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

// JetBrains Mono: UI chrome for slugs, datelines, marginalia, and CTAs.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
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
    default: 'AGI | Beyond one model. Beyond one surface.',
    template: '%s | AGI',
  },
  description:
    'AGI is a multi-provider AI application suite across web, mobile, desktop, CLI, Chrome, and VS Code with Local, BYOK, and invite-only managed cloud modes.',
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
    siteName: 'AGI',
    title: 'AGI | Beyond one model. Beyond one surface.',
    description:
      'A multi-provider AI application suite across web, mobile, desktop, CLI, Chrome, and VS Code.',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI - Just ask, it does',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI | Beyond one model. Beyond one surface.',
    description:
      'A multi-provider AI application suite with Local, BYOK, and invite-only managed cloud modes.',
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
    name: 'AGI',
    url: APP_URL,
    logo: `${APP_URL}/logo.png`,
    description:
      'Multi-provider AI application suite across web, mobile, desktop, CLI, Chrome, and VS Code.',
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
    name: 'AGI',
    description:
      'Multi-provider AI applications with Local, BYOK, and invite-only managed cloud modes',
    applicationCategory: 'Business Application',
    operatingSystem: 'macOS, Windows, Linux, Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    url: APP_URL,
  };

  // JSON-LD Schema for WebSite
  const webSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AGI',
    url: APP_URL,
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Organization Schema */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {/* SoftwareApplication Schema */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
        {/* WebSite Schema */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ClerkProvider>
          <SkipLinks />
          <Providers nonce={nonce}>{children}</Providers>
          {/* GA4: only rendered when NEXT_PUBLIC_GA_TRACKING_ID is set */}
          {gaTrackingId && <GoogleAnalytics trackingId={gaTrackingId} nonce={nonce} />}
        </ClerkProvider>
      </body>
    </html>
  );
}
