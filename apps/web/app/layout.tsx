import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono, IBM_Plex_Sans, JetBrains_Mono, Newsreader } from 'next/font/google';
import { headers } from 'next/headers';
import { THEME_INIT_SCRIPT } from '@/shared/components/seo/theme-init-script';
import './globals.css';
import Providers from './providers';
import { AnalyticsConsentGate } from '@shared/components/AnalyticsConsentGate';
import { CookieConsent } from '@shared/components/CookieConsent';
import { SkipLinks } from '@shared/components/accessibility/SkipLinks';
import { JsonLd } from '@shared/components/seo/JsonLd';
import { WebPushOptIn } from '@/features/notifications';
import { OG_IMAGE } from '@/lib/seo/site';
import { readServerTelemetryConsent } from '@/lib/server/telemetry-consent';
import {
  organizationSchema,
  softwareApplicationSchema,
  webSiteSchema,
} from '@/lib/seo/structured-data';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
  adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

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
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'AGI | One AI workspace across models and tools.',
    template: '%s | AGI',
  },
  description:
    'AGI is an AI workspace for chat, coding, research, files, projects, artifacts, tools, connectors, memory, and automation with explicit Local, BYOK, and managed cloud boundaries.',
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
        url: OG_IMAGE.url,
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
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
    images: ['/api/og'],
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
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  const gaTrackingId = process.env['NEXT_PUBLIC_GA_TRACKING_ID'];

  // The account's real, server-stored consent, so a brand-new device's first
  // paint sees it before instrumentation-client.ts decides whether to init
  // Sentry (WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01). The helper owns the
  // auth() call inside its catch-all: this layout renders routes the Clerk
  // proxy matcher excludes, where a bare auth() throws and 500s the page.
  const telemetryConsent = await readServerTelemetryConsent();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-telemetry-consent={String(telemetryConsent)}
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        {/*
         */}
        {/* THEME_INIT_SCRIPT is a build-time constant with no interpolation and no
            request-derived input, and a <script> body cannot be text-rendered.
            llm-guardrail-allow: constant script body, nonce-gated by the CSP. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Site-wide structured data: Organization, WebSite (no SearchAction),
            and SoftwareApplication. Nonce-carried for the strict CSP. */}
        <JsonLd data={[organizationSchema(), webSiteSchema(), softwareApplicationSchema()]} />
        {/*
         */}
        <ClerkProvider localization={clerkLocalization} telemetry={{ disabled: true }}>
          <SkipLinks />
          {/*
           */}
          <div id="main-content" role="main" tabIndex={-1}>
            <Providers nonce={nonce}>{children}</Providers>
          </div>
          {/*
           */}
          <CookieConsent />
          <WebPushOptIn />
          {gaTrackingId && <AnalyticsConsentGate trackingId={gaTrackingId} nonce={nonce} />}
        </ClerkProvider>
      </body>
    </html>
  );
}
