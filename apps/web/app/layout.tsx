import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, JetBrains_Mono, Newsreader } from 'next/font/google';
import { headers } from 'next/headers';
import { THEME_INIT_SCRIPT } from '@/shared/components/seo/theme-init-script';
import {
  BROWSER_SUPPORT_SCRIPT,
  JAVASCRIPT_REQUIRED_NOTICE,
  UNSUPPORTED_BROWSER_NOTICE,
  UNSUPPORTED_BROWSER_NOTICE_ID,
} from '@/lib/browser-support';
import './globals.css';
import '@/features/marketing/components/legacy-pages.css';
import Providers from './providers';
import { AnalyticsConsentGate } from '@shared/components/AnalyticsConsentGate';
import { CookieConsent } from '@shared/components/CookieConsent';
import { SupportWidgetEntry } from '@/features/support/components/SupportWidgetEntry';
import { SkipLinks } from '@shared/components/accessibility/SkipLinks';
import { JsonLd } from '@shared/components/seo/JsonLd';
import { BrowserIdentityBoundary } from './BrowserIdentityBoundary';
import { OG_IMAGE, SITE_LEGAL_NAME, SITE_NAME, SITE_URL, TWITTER_HANDLE } from '@/lib/seo/site';
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  authors: [{ name: SITE_LEGAL_NAME }],
  creator: SITE_LEGAL_NAME,
  publisher: SITE_LEGAL_NAME,
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
    url: SITE_URL,
    siteName: SITE_NAME,
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
    creator: TWITTER_HANDLE,
    images: [OG_IMAGE.url],
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

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        {/*
         * No literal <head>: the App Router owns it, and one here streams into
         * <body> and breaks hydration. The theme script stays the first, inline,
         * blocking child of <body> so the first paint uses the right theme.
         */}
        {/* THEME_INIT_SCRIPT is a build-time constant with no interpolation and no
            request-derived input, and a <script> body cannot be text-rendered.
            llm-guardrail-allow: constant script body, nonce-gated by the CSP. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <div
          id={UNSUPPORTED_BROWSER_NOTICE_ID}
          role="alert"
          hidden
          suppressHydrationWarning
          className="border-b border-border bg-background px-4 py-3 text-center text-sm text-foreground"
        >
          {UNSUPPORTED_BROWSER_NOTICE}
        </div>
        {/* llm-guardrail-allow: constant script body, nonce-gated by the CSP. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: BROWSER_SUPPORT_SCRIPT }} />
        <noscript>
          <p className="border-b border-border bg-background px-4 py-3 text-center text-sm text-foreground">
            {JAVASCRIPT_REQUIRED_NOTICE}
          </p>
        </noscript>
        {/* Site-wide structured data: Organization, WebSite (no SearchAction),
            and SoftwareApplication. Nonce-carried for the strict CSP. */}
        <JsonLd data={[organizationSchema(), webSiteSchema(), softwareApplicationSchema()]} />
        {/*
         * DPDP consent gating: Clerk's own product telemetry is switched off.
         *
         * The cookie banner gates GA4 and nothing else, because GA4 was the
         * only tracker anyone had counted. Clerk's SDK ships an opt-OUT
         * telemetry collector that posts to clerk-telemetry.com on mount, for
         * every visitor, before any consent interaction, and unlike GA4 there
         * is no switch for a visitor to reach. Rather than add a third consent
         * category for a ping the product gets no value from, it is disabled
         * outright: `TelemetryCollector` treats `disabled: true` as final
         * (@clerk/shared telemetry collector, `#shouldRecord`).
         *
         * If this ever needs to come back, it needs a consent category and a
         * row on /cookies in the same change, not a silent re-enable.
         */}
        <BrowserIdentityBoundary>
          <SkipLinks />
          {/*
           * No landmark here. Each route owns its `main`: the marketing pages
           * render `<main id="main-content">`, `WebAppShell` and the chat
           * column carry `role="main"` with the same id. A wrapper landmark
           * at this level sat around the sidebar navigation and doubled
           * every page that already had one.
           */}
          <Providers nonce={nonce}>{children}</Providers>
          {/*
           * The banner is the only thing that can turn analytics on, and
           * `AnalyticsConsentGate` is the only thing that may mount GA4, as the
           * /cookies policy promises ("Analytics is opt-in"). The single switch
           * for that position is `ANALYTICS_REQUIRES_CONSENT` in
           * shared/lib/cookie-consent.ts.
           */}
          <CookieConsent />
          <SupportWidgetEntry />
          {gaTrackingId && <AnalyticsConsentGate trackingId={gaTrackingId} nonce={nonce} />}
        </BrowserIdentityBoundary>
      </body>
    </html>
  );
}
