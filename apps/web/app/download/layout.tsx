import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Coming Soon',
  description:
    'AGI is coming to macOS, Windows, and Linux. A native desktop AI assistant with browser automation, multi-model chat, and AI skills. Leave your email to get notified.',
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
    title: 'AGI Desktop App: Coming Soon',
    description:
      'The native desktop AI assistant for macOS, Windows, and Linux is in development. Get notified when it opens.',
    type: 'website',
    url: 'https://agiworkforce.com/download',
    images: [
      {
        url: '/app-preview.png',
        width: 1024,
        height: 665,
        alt: 'AGI for macOS, Windows, and Linux — coming soon',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Desktop App: Coming Soon',
    description: 'Native AI desktop assistant for macOS, Windows, and Linux. Coming soon.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
  alternates: {
    canonical: '/download',
  },
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
