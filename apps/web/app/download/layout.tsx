import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download | AGI Workforce',
  description:
    'Download AGI Workforce for macOS, Windows, and Linux. Install the desktop app to start building autonomous AI agents.',
  openGraph: {
    title: 'Download AGI Workforce Desktop App',
    description: 'Get the desktop app for Windows, macOS, and Linux. Free to download and use.',
    type: 'website',
    url: 'https://agiworkforce.com/download',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Download AGI Workforce',
      },
    ],
  },
  alternates: {
    canonical: 'https://agiworkforce.com/download',
  },
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
