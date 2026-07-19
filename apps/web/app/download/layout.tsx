import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download AGI Desktop',
  description:
    'Download the signed AGI Desktop AppImage for Linux x64. macOS and Windows installers are not yet published.',
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
      'The signed Linux x64 AppImage is available through the stable release channel. macOS and Windows installers are not yet published.',
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
    description:
      'Signed Linux x64 AppImage availability, with current macOS and Windows release status.',
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
