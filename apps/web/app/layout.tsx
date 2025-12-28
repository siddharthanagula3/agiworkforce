import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

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
    'Deploy autonomous AI agents to automate complex desktop and web workflows. Blazing fast, secure, and built for the autonomous era.',
  keywords: [
    'AI agents',
    'automation',
    'AGI',
    'workforce',
    'autonomous agents',
    'workflow automation',
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
    description: 'Deploy autonomous AI agents to automate complex desktop and web workflows.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce - Deploy autonomous AI agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description: 'Deploy autonomous AI agents to automate complex desktop and web workflows.',
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
      'Deploy autonomous AI agents to automate complex desktop and web workflows. Blazing fast, secure, and built for the autonomous era.',
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
