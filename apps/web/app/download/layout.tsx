import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download AGI Desktop',
  description:
    'Check verified AGI Desktop installer availability for macOS, with the Windows release status.',
  keywords: [
    'download AI app',
    'AGI download',
    'AI desktop app',
    'macOS AI',
    'Windows AI',
    'Linux AI',
    'desktop automation',
  ],
  openGraph: {
    title: 'Download AGI Desktop',
    description:
      'Live release verification for the AGI Desktop installer on macOS, with the Windows release status.',
    type: 'website',
    url: 'https://agiworkforce.com/download',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AGI Desktop application preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download AGI Desktop',
    description: 'Verified macOS installer availability, with the current Windows release status.',
    images: ['/api/og'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/download',
  },
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
