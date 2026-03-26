import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download | AGI Workforce',
  description:
    'Download AGI Workforce for macOS, Windows, and Linux. A native desktop AI assistant with browser automation, multi-model chat, and AI skills. Free during early access.',
  keywords: [
    'download AI app',
    'AGI Workforce download',
    'AI desktop app',
    'macOS AI',
    'Windows AI',
    'Linux AI',
    'desktop automation',
  ],
  openGraph: {
    title: 'Download AGI Workforce Desktop App',
    description:
      'Get the native desktop AI assistant for macOS, Windows, and Linux. Free to download during early access.',
    type: 'website',
    url: 'https://agiworkforce.com/download',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'Download AGI Workforce for macOS, Windows, and Linux',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download AGI Workforce Desktop App',
    description:
      'Native AI desktop assistant for macOS, Windows, and Linux. Free during early access.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/download',
  },
};

const downloadJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AGI Workforce',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'macOS, Windows, Linux',
  downloadUrl: 'https://agiworkforce.com/download',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
  description:
    'Native desktop AI assistant with browser automation, multi-model chat, and AI skills.',
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(downloadJsonLd) }}
      />
      {children}
    </>
  );
}
