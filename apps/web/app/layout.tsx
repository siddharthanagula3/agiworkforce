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
  metadataBase: new URL('https://agiworkforce.com'),
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
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Workforce | Your On-Demand AI Workforce',
    description: 'Deploy autonomous AI agents to automate complex desktop and web workflows.',
    creator: '@agiworkforce',
    images: ['/og-image.png'],
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
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
