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

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to AGI',
      titleCombined: 'Sign in or create an AGI account',
      subtitle: 'Welcome back. Continue to your AGI workspace.',
      subtitleCombined: 'Use your AGI account to continue.',
    },
  },
  signUp: {
    start: {
      title: 'Create your AGI account',
      titleCombined: 'Create or sign in to AGI',
      subtitle: 'Start with the hosted web trial, then move serious work to Local or BYOK.',
      subtitleCombined: 'Use your AGI account to continue.',
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'AGI | One AI workspace across models and tools.',
    template: '%s | AGI',
  },
  description:
    'AGI is an AI workspace for chat, coding, research, files, projects, artifacts, tools, connectors, memory, and automation with explicit Local, BYOK, and public-alpha managed cloud boundaries.',
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
    title: 'AGI | One AI workspace across models and tools.',
    description:
      'A practical AI workspace for chat, code, research, files, tools, artifacts, connectors, and automation.',
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
    title: 'AGI | One AI workspace across models and tools.',
    description:
      'Chat, code, research, files, artifacts, tools, connectors, and automation in one AGI workspace.',
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
      'AI workspace for chat, code, research, files, tools, artifacts, connectors, memory, and automation.',
    sameAs: ['https://twitter.com/agiworkforce', 'https://github.com/agiworkforce'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'contact@agiworkforce.com',
    },
  };

  // JSON-LD Schema for SoftwareApplication. No `offers` or `operatingSystem`:
  // every surface (Web, Desktop, Mobile, CLI, Chrome, VS Code) is coming soon,
  // and neither field should assert current availability or pricing.
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AGI',
    description: 'AI workspace with explicit Local, BYOK, and open managed cloud modes',
    applicationCategory: 'Business Application',
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
        <script nonce={nonce} suppressHydrationWarning type="application/ld+json">
          {serializeJsonLd(organizationSchema)}
        </script>
        {/* SoftwareApplication Schema */}
        <script nonce={nonce} suppressHydrationWarning type="application/ld+json">
          {serializeJsonLd(softwareAppSchema)}
        </script>
        {/* WebSite Schema */}
        <script nonce={nonce} suppressHydrationWarning type="application/ld+json">
          {serializeJsonLd(webSiteSchema)}
        </script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ClerkProvider localization={clerkLocalization}>
          <SkipLinks />
          {/*
           * role="main" (rather than a native <main> tag) so nested route
           * pages that already render their own <main> (marketing pages)
           * don't end up with two <main> elements, which is invalid HTML.
           * This still gives every route — including the authenticated
           * chat app, which has no <main> of its own — a main landmark
           * for assistive tech and the skip link to jump to.
           */}
          <div id="main-content" role="main" tabIndex={-1}>
            <Providers nonce={nonce}>{children}</Providers>
          </div>
          {/* GA4: only rendered when NEXT_PUBLIC_GA_TRACKING_ID is set */}
          {gaTrackingId && <GoogleAnalytics trackingId={gaTrackingId} nonce={nonce} />}
        </ClerkProvider>
      </body>
    </html>
  );
}
