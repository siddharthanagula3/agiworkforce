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
        url: '/app-preview.png',
        width: 1024,
        height: 665,
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
