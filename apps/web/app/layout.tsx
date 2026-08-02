import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono, JetBrains_Mono, Newsreader } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import Providers from './providers';
import { AnalyticsConsentGate } from '@shared/components/AnalyticsConsentGate';
import { CookieConsent } from '@shared/components/CookieConsent';
import { SkipLinks } from '@shared/components/accessibility/SkipLinks';
import { JsonLd } from '@shared/components/seo/JsonLd';
import { OG_IMAGE } from '@/lib/seo/site';
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

/**
 * AUDIT-FIX GOV-39: mobile viewport contract for the chat surface.
 *
 * `viewportFit: 'cover'` paints the app under the iOS home indicator and the
 * notch. That is only safe when the layout also honours the safe-area insets —
 * without them, `cover` makes the omission WORSE than the default, and the
 * composer's send button sat underneath the home indicator.
 * `.safe-area-bottom` in globals.css supplies the padding.
 *
 * `interactiveWidget: 'resizes-content'` is the other half: by default the
 * on-screen keyboard only shrinks the VISUAL viewport, so a `position: sticky;
 * bottom: 0` composer stays pinned to the (unchanged) layout viewport and ends
 * up behind the keyboard. Resizing the layout viewport instead keeps the
 * composer directly above the keyboard with no `visualViewport` JS, which is
 * the behaviour apps/mobile already gets from KeyboardAvoidingView.
 */
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
  // Read the per-request nonce set by the proxy for CSP compliance
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  // Only wire GA4 when the tracking ID env var is set
  const gaTrackingId = process.env['NEXT_PUBLIC_GA_TRACKING_ID'];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Site-wide structured data: Organization, WebSite (no SearchAction),
            and SoftwareApplication. Nonce-carried for the strict CSP. */}
        <JsonLd data={[organizationSchema(), webSiteSchema(), softwareApplicationSchema()]} />
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
          {/*
           * SIX-25 — cookie consent.
           *
           * The banner is the only thing that can turn analytics on, and
           * `AnalyticsConsentGate` is the only thing that may mount GA4. GA4
           * used to load for every visitor whenever NEXT_PUBLIC_GA_TRACKING_ID
           * was set, contradicting the /cookies policy ("Analytics is opt-in").
           * The single switch for that position is
           * `ANALYTICS_REQUIRES_CONSENT` in shared/lib/cookie-consent.ts.
           */}
          <CookieConsent />
          {gaTrackingId && <AnalyticsConsentGate trackingId={gaTrackingId} nonce={nonce} />}
        </ClerkProvider>
      </body>
    </html>
  );
}
