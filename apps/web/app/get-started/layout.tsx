import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started',
  description:
    'AGI Web works today in the browser. Desktop, Mobile, CLI, Chrome, and VS Code are coming soon — get notified when each surface opens.',
  openGraph: {
    title: 'Getting Started',
    description: 'Start with AGI Web today. Other surfaces are coming soon.',
    type: 'website',
    url: 'https://agiworkforce.com/get-started',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Getting Started with AGI',
      },
    ],
  },
  alternates: {
    canonical: 'https://agiworkforce.com/get-started',
  },
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
