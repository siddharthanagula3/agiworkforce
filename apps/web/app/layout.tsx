import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://agiworkforce.com'), //agiworkforce.com'),
  title: {
    default: 'AGI Workforce | Your On-Demand AI Workforce',
    template: '%s | AGI Workforce',
  },
  description:
    'Just tell the AI what you want done. No setup, no coding required. Desktop and web automation with full undo support. Powered by GPT-5, Claude 4.5, Gemini 3.',
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
    url: 'https://agiworkforce.com',
    siteName: 'AGI Workforce',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description:
      'Just tell the AI what you want done. No setup, no coding required. Full undo support.',
    images: [
      {
        url: '/og-image.svg',
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
      'Just tell the AI what you want done. No setup, no coding required. Full undo support.',
    creator: '@agiworkforce',
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JSON-LD Schema for Organization
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AGI Workforce',
    url: 'https://agiworkforce.com',
    logo: 'https://agiworkforce.com/logo.png',
    description:
      'Just tell the AI what you want done. No setup, no coding required. Desktop and web automation with full undo support.',
    sameAs: ['https://twitter.com/agiworkforce', 'https://github.com/agiworkforce'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'support@agiworkforce.com',
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
    url: 'https://agiworkforce.com',
  };

  return (
    <html lang="en">
      <head>
        {/* Organization Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {/* SoftwareApplication Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
